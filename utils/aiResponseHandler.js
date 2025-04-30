/**
 * AI 回應處理模塊 - 使用 LangChain 和 Gemini 處理用戶消息
 */
const { ChatOpenAI } = require("@langchain/openai"); // 使用 OpenAI 模型
// const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const {
  PromptTemplate,
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const config = require("../config");
const logger = require("./logger");

// 上傳對話紀錄到資料庫(pinecone、mongoDB)
const { processAndStoreConversation } = require("./conversationHandler");
// 存儲用戶對話歷史的簡單內存緩存
const conversationHistory = new Map();

// 對話歷史的最大長度（幾輪對話）
const MAX_HISTORY_LENGTH = 5;

// 初始化 Gemini 模型
const initGeminiModel = () => {
  try {
    // 從配置模塊中獲取 API 密鑰，如果沒有，拋出錯誤
    const apiKey = config.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 未設置，請在環境變量中添加");
    }

    // 初始化 Gemini 模型
    const model = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      modelName: "gemini-1.5-pro", // 更新為正確的模型名稱
      temperature: 0.7, // 創造性設置
      maxOutputTokens: 500, // 控制回應長度
    });

    return model;
  } catch (error) {
    console.error("初始化 Gemini 模型失敗:", error.message);
    throw error;
  }
};

// 初始化 OpenAI 模型
const initOpenAIModel = () => {
  try {
    // 從配置模塊中獲取 API 密鑰，如果沒有，拋出錯誤
    const apiKey = config.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 未設置，請在環境變量中添加");
    }

    // 初始化 OpenAI 模型
    const model = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: "gpt-3.5-turbo-0125", // 可以根據需要選擇不同的模型
      temperature: 0.2, // 創造性設置
      maxTokens: 400, // 控制回應長度
    });

    return model;
  } catch (error) {
    console.error("初始化 OpenAI 模型失敗:", error.message);
    throw error;
  }
};

/**
 * 獲取用戶的對話歷史
 * @param {string} userId - 用戶ID
 * @returns {Array} - 對話歷史數組
 */
const getConversationHistory = (userId) => {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  return conversationHistory.get(userId);
};

/**
 * 添加新的對話記錄到歷史
 * @param {string} userId - 用戶ID
 * @param {string} userMessage - 用戶消息
 * @param {string} botResponse - 機器人回應
 */
const addToConversationHistory = (userId, userMessage, botResponse) => {
  const history = getConversationHistory(userId);

  // 添加新的對話
  history.push({
    user: userMessage,
    bot: botResponse,
    timestamp: new Date().toISOString(),
  });

  // 如果歷史超過最大長度，移除最早的對話
  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  // 更新緩存
  conversationHistory.set(userId, history);
};

/**
 * 格式化對話歷史為提示模板可用的格式
 * @param {Array} history - 對話歷史數組
 * @returns {string} - 格式化後的對話歷史
 */
const formatConversationHistory = (history) => {
  if (!history || history.length === 0) {
    return "無對話歷史";
  }

  return history
    .map((entry) => `用戶: ${entry.user}\n機器人: ${entry.bot}`)
    .join("\n\n");
};

// 新朋友的 prompt 使用系統消息格式
function getNewUserPromptTemplate() {
  // 創建系統消息模板
  const systemTemplate = `
  你是 K&Q 服飾的客服機器人，只做以下事情：

  1. 使用者輸入內容後，請依照下列規則回應，請務必只用「對應的回覆」，不要多說、不要自由發揮。
  2. 若用戶打了「我是新朋友」、「我是新朋有」、「我是第一次來」等類似語句，請回覆以下訊息：
  回答:🎉 歡迎加入 K&Q 服飾 ❤️  
  新粉購物金請點下方連結⬇️  
  https://jambolive.tv/pay/order/16918/  
  🛎提醒您，新粉購物金只保留一個星期，要和得標商品一起結單，請勿單獨結掉，這樣會沒有優惠喔！

  3. 若用戶問「怎麼購買」、「要怎麼下單」、「我要買這個」，請回覆：
  回答:有看到喜歡的商品，直接直播上輸入『關鍵字+1』即可唷！  
  例如：喜歡 06 就打「06+1」，系統會自動入單。  
  若商品數量有限，可私訊小編詢問是否能加單。

  4. 若用戶問「購物金怎麼拿」、「購物金怎麼用」或類似語句，請回覆：
  新粉購物金請點下方連結⬇️  
  https://jambolive.tv/pay/order/16918/

  5. 若用戶問「有什麼注意事項」、「買這個要注意什麼」、「怎麼結單」等類語句，請回覆：
  ⚠️購買注意事項請詳細閱讀  
  ✅加單請以直播為主，尺寸可直接在直播詢問  
  ✅直播結標後，入單會花點時間，請到購物車確認  
  ✅本賣場不提供商品照，請截圖或看直播回放  
  ✅購物金請等待確認後再結單  
  ✅結單前請確認品項與金額無誤  
  ✅現貨 2-5 天出貨，預購約 3 週，提前到貨會盡快寄出  
  ✅商品如有問題請於 7-14 天內私訊小編處理

  6. 若用戶說「我下標了然後呢」、「我買了接下來要做什麼」，請回覆：
  哈囉您好，購物車裡商品請盡快幫我們結單唷！  
  系統『只保留10天』，超過期限將被刪除訂單！  
  若需併單或特定日期寄出麻煩在『結單備註處』備註即可。  
  （若已結單，請忽略此訊息）

  7. 若無法辨識語意，請說：「目前這個問題還沒辦法處理，請等待真人客服回訊」

  請嚴格依照以上邏輯回覆。

  對話歷史：
  {conversationHistory}`;

  const humanTemplate = "{userMessage}";

  // 創建包含系統消息和人類消息的聊天提示模板
  const chatPrompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(systemTemplate),
    HumanMessagePromptTemplate.fromTemplate(humanTemplate),
  ]);

  return chatPrompt;
}

// 老朋友的 prompt
function getExistingUserPromptTemplate() {
  // 創建系統消息模板
  const systemTemplate = `
  你是 K&Q 服飾的客服機器人，只做以下事情：

  1. 使用者輸入內容後，請依照下列規則回應，請務必只用「對應的回覆」，不要多說、不要自由發揮。
  2. 若用戶打了「我是新朋友」、「我是新朋有」、「我是第一次來」等類似語句，請回覆以下訊息：
  回答:🎉 歡迎加入 K&Q 服飾 ❤️  
  新粉購物金請點下方連結⬇️  
  https://jambolive.tv/pay/order/16918/  
  🛎提醒您，新粉購物金只保留一個星期，要和得標商品一起結單，請勿單獨結掉，這樣會沒有優惠喔！

  3. 若用戶問「怎麼購買」、「要怎麼下單」、「我要買這個」，請回覆：
  回答:有看到喜歡的商品，直接直播上輸入『關鍵字+1』即可唷！  
  例如：喜歡 06 就打「06+1」，系統會自動入單。  
  若商品數量有限，可私訊小編詢問是否能加單。

  4. 若用戶問「購物金怎麼拿」、「購物金怎麼用」或類似語句，請回覆：
  新粉購物金請點下方連結⬇️  
  https://jambolive.tv/pay/order/16918/

  5. 若用戶問「有什麼注意事項」、「買這個要注意什麼」、「怎麼結單」等類語句，請回覆：
  ⚠️購買注意事項請詳細閱讀  
  ✅加單請以直播為主，尺寸可直接在直播詢問  
  ✅直播結標後，入單會花點時間，請到購物車確認  
  ✅本賣場不提供商品照，請截圖或看直播回放  
  ✅購物金請等待確認後再結單  
  ✅結單前請確認品項與金額無誤  
  ✅現貨 2-5 天出貨，預購約 3 週，提前到貨會盡快寄出  
  ✅商品如有問題請於 7-14 天內私訊小編處理

  6. 若用戶說「我下標了然後呢」、「我買了接下來要做什麼」，請回覆：
  哈囉您好，購物車裡商品請盡快幫我們結單唷！  
  系統『只保留10天』，超過期限將被刪除訂單！  
  若需併單或特定日期寄出麻煩在『結單備註處』備註即可。  
  （若已結單，請忽略此訊息）

  7. 若無法辨識語意，請說：「目前這個問題還沒辦法處理，請等待真人客服回訊」

  請嚴格依照以上邏輯回覆。

  對話歷史：
  {conversationHistory}`;

  const humanTemplate = "{userMessage}";

  // 創建包含系統消息和人類消息的聊天提示模板
  const chatPrompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(systemTemplate),
    HumanMessagePromptTemplate.fromTemplate(humanTemplate),
  ]);

  return chatPrompt;
}

/**
 * 處理用戶消息並使用 Gemini 生成回應
 * @param {string} userId - 用戶ID
 * @param {string} userMessage - 用戶消息
 * @param {object} options - 選項
 * @param {boolean} options.isNewUser - 是否為新用戶
 * @param {boolean} options.useTestMode - 是否使用測試模式上傳到向量資料庫
 * @returns {Promise<string>} - AI 生成的回應
 */
const generateAIResponse = async (userId, userMessage, options = {}) => {
  const {
    isNewUser = false, // 是否為新用戶
    useTestMode = false, // 是否使用測試模式
  } = options;

  try {
    // 記錄請求
    logger.logMessage(
      `正在生成對用戶 ${userId} 消息: ${userMessage} 的 AI 回應`,
      userId,
      "ai_processing"
    );

    // console.log("AI 回應處理，測試模式:", useTestMode ? "開啟" : "關閉");

    const model = initOpenAIModel(); // 初始化 OpenAI 模型
    const history = getConversationHistory(userId); // 獲取用戶的對話歷史
    const formattedHistory = formatConversationHistory(history); // 格式化對話歷史

    // 根據用戶類型選擇不同的提示模板
    const promptTemplate = isNewUser
      ? getNewUserPromptTemplate()
      : getExistingUserPromptTemplate();

    // 使用 LangChain 的聊天模型和提示模板
    const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

    // 執行鏈
    const response = await chain.invoke({
      conversationHistory: formattedHistory,
      userMessage: userMessage.trim(),
    });

    const cleanedResponse = response.trim();

    // 將對話添加到 llm 的對話紀錄中(記憶)
    addToConversationHistory(userId, userMessage, cleanedResponse);

    // 上傳對話紀錄到資料庫(pinecone、mongoDB)
    try {
      // console.log(
      //   `開始處理並存儲對話 (測試模式: ${useTestMode ? "開啟" : "關閉"})`
      // );
      const storeResult = await processAndStoreConversation(
        userId,
        userMessage,
        cleanedResponse,
        {
          useTestMode: useTestMode, // 使用傳入的參數
          syncProcess: false, // 同步處理向量存儲
        }
      );
      // console.log("處理並存儲對話結果:", storeResult);
    } catch (storeError) {
      console.error("處理並存儲對話失敗:", storeError);
    }

    // 記錄成功生成
    logger.logMessage(`成功生成 AI 回應`, userId, "ai_response_success");
    return cleanedResponse;
  } catch (error) {
    // 記錄錯誤
    logger.logMessage(
      `生成 AI 回應失敗: ${error.message}`,
      userId,
      "ai_response_error"
    );
    console.error("生成 AI 回應失敗:", error);

    // 返回一個預設回應
    return "抱歉，我現在無法回應您的問題。請稍後再試。";
  }
};

// 公開方法
module.exports = {
  generateAIResponse,
};
