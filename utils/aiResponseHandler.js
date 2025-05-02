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
const LevelOneQuestion = require("../models/LevelOneQuestion");
const Rule = require("../models/Rule");

// 上傳對話紀錄到資料庫(pinecone、mongoDB)
const { processAndStoreConversation } = require("./conversationHandler");
// 存儲用戶對話歷史的簡單內存緩存
const conversationHistory = new Map();

// 對話歷史的最大長度（幾輪對話）
const MAX_HISTORY_LENGTH = 5;

// 緩存分類選項與指南，避免頻繁查詢數據庫
let cachedCategoryData = null;
let cacheTimestamp = null;
const CACHE_TTL = 30 * 60 * 1000; // 30分鐘緩存過期時間

/**
 * 從 MongoDB 獲取分類選項與指南
 * @returns {Promise<Object>} 包含分類選項和分類指南的對象
 */
const getClassificationOptionsFromDB = async () => {
  try {
    // 檢查緩存是否有效
    const now = Date.now();
    if (
      cachedCategoryData &&
      cacheTimestamp &&
      now - cacheTimestamp < CACHE_TTL
    ) {
      logger.logMessage("使用緩存的分類數據", "system", "cache_used");
      return cachedCategoryData;
    }

    // 從 LevelOneQuestion 集合中獲取所有問題
    const questions = await LevelOneQuestion.find({}).lean();
    const rules = await Rule.find({}).lean();

    // 如果沒有數據，使用預設值
    if (!questions || questions.length === 0) {
      // 如果沒有數據，使用預設值
      logger.logMessage(
        "數據庫中無分類數據，使用預設值",
        "system",
        "default_categories"
      );
      return getDefaultCategoryData();
    }

    // 提取所有問題作為分類選項
    const classificationOptions = questions.map((q) => q.question);

    // 構建分類指南
    const classificationGuide = rules
      .map((q) => {
        // 將答案前30個字作為指南，避免太長
        const guide =
          q.description.length > 60
            ? q.description.substring(0, 60) + "..."
            : q.description;

        return `- "${q.label}" - ${guide}`;
      })
      .join("\n");

    // 更新緩存
    cachedCategoryData = {
      options: classificationOptions,
      guide: classificationGuide,
    };
    cacheTimestamp = now;

    logger.logMessage(
      `從數據庫獲取了 ${classificationOptions.length} 個分類選項`,
      "system",
      "db_categories"
    );
    return cachedCategoryData;
  } catch (error) {
    logger.logMessage(
      `獲取分類數據失敗: ${error.message}`,
      "system",
      "db_error"
    );
    console.error("獲取分類數據失敗:", error);

    // 發生錯誤時使用預設值
    return getDefaultCategoryData();
  }
};

/**
 * 獲取預設分類數據
 * @returns {Object} 預設的分類選項和指南
 */
const getDefaultCategoryData = () => {
  // const defaultOptions = [
  //   "我是新朋友",
  //   "出貨時間/出貨狀況",
  //   "直播時間",
  //   "付款方式/寄送方式",
  //   "出貨時間",
  //   "商品瑕疵/退貨",
  //   "如何結單",
  // ];
  // const defaultGuide = `
  // - "我是新朋友" - 用戶表示是新客戶、第一次購買或詢問新客戶相關事項
  // - "出貨時間/出貨狀況" - 用戶詢問商品何時會寄出、配送進度或出貨相關問題
  // - "直播時間" - 用戶詢問直播何時開始、結束或直播時間表
  // - "付款方式/寄送方式" - 用戶詢問如何付款或商品如何寄送
  // - "出貨時間" - 用戶純粹詢問出貨所需時間
  // - "商品瑕疵/退貨" - 用戶反映商品有問題或想要退換貨
  // - "如何結單" - 用戶詢問如何完成訂單、支付或結帳流程
  // `;
  // return {
  //   options: defaultOptions,
  //   guide: defaultGuide,
  // };
};

// 初始化 Gemini 模型
const initGeminiModel = () => {
  try {
    // 從配置模塊中獲取 API 密鑰，如果沒有，拋出錯誤
    const apiKey = config.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY 未設置，請在環境變量中添加");
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
async function getNewUserPromptTemplate() {
  // 從數據庫獲取分類選項和指南
  const categoryData = await getClassificationOptionsFromDB(); // 獲取分類選項和指南

  // 創建系統消息模板
  const systemTemplate = `
  你是 K&Q 服飾的客服分類機器人。你的任務是將用戶輸入的訊息分類到以下幾個預設類別中的一個，並返回一個 JSON 格式的結果，包含分類結果和信心值。

  可用的分類選項（僅限以下選項）：
  ${JSON.stringify(categoryData.options)}

  請嚴格遵守以下規則：
  1. 你必須且只能回傳一個 JSON 對象，包含兩個屬性：category 和 confidence。
  2. category 必須是上述陣列中的一個選項。
  3. confidence 是一個介於 0 到 1 之間的數字，表示對該分類的信心程度。
  4. 不要添加任何解釋、前綴或後綴，只返回純 JSON 格式。
  5. 如果用戶訊息無法明確分類到這些選項之一，請選擇最相關的選項並給出相應的信心值。
  6. 不要在回應中包含反引號（\`）、代碼塊標記（\`\`\`）或其他非 JSON 字符。

  分類指南：
  ${categoryData.guide}
  
  對話歷史：
  {conversationHistory}
  
  請只輸出一個 JSON 對象，格式如下：
  {{"category": "選擇的分類", "confidence": 信心值}}`;

  const humanTemplate = "{userMessage}";

  // 創建包含系統消息和人類消息的聊天提示模板
  const chatPrompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(systemTemplate),
    HumanMessagePromptTemplate.fromTemplate(humanTemplate),
  ]);

  return chatPrompt;
}

// 老朋友的 prompt
async function getExistingUserPromptTemplate() {
  // 從數據庫獲取分類選項和指南
  const categoryData = await getClassificationOptionsFromDB();

  // 創建系統消息模板
  // ❗為什麼 {{"category": "選擇的分類", "confidence": 信心值}}` 要是這樣寫？
  const systemTemplate = `
  你是 K&Q 服飾的客服分類機器人。你的任務是將用戶輸入的訊息分類到以下幾個預設類別中的一個，並返回一個 JSON 格式的結果，包含分類結果和信心值。

  可用的分類選項（僅限以下選項）：
  ${JSON.stringify(categoryData.options)}

  請嚴格遵守以下規則：
  1. 你必須且只能回傳一個 JSON 對象，包含兩個屬性：category 和 confidence。
  2. category 必須是上述陣列中的一個選項。
  3. confidence 是一個介於 0 到 1 之間的數字，表示對該分類的信心程度。
  4. 不要添加任何解釋、前綴或後綴，只返回純 JSON 格式。
  5. 如果用戶訊息無法明確分類到這些選項之一，請選擇最相關的選項並給出相應的信心值。
  6. 不要在回應中包含反引號（\`）、代碼塊標記（\`\`\`）或其他非 JSON 字符。

  分類指南：
  ${categoryData.guide}
  
  對話歷史：
  {conversationHistory}
  
  請只輸出一個 JSON 對象，格式如下：
  {{"category": "選擇的分類", "confidence": 信心值}}`;

  const humanTemplate = "{userMessage}";

  // 創建包含系統消息和人類消息的聊天提示模板
  const chatPrompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(systemTemplate),
    HumanMessagePromptTemplate.fromTemplate(humanTemplate),
  ]);

  return chatPrompt;
}

/**
 * 驗證 AI 回應是否為有效的 JSON 格式並包含所需屬性
 * @param {string} response - AI 生成的回應
 * @returns {Object} - 包含驗證結果和解析的 JSON 數據（如果有效）
 */
const validateAndParseJsonResponse = (response) => {
  const result = {
    isValid: false,
    data: null,
    error: null,
  };

  try {
    // 使用正則表達式檢查是否符合 JSON 格式的基本結構
    // 簡單檢查是否以 { 開頭，以 } 結尾，中間包含至少一個 "key": value 對
    const jsonRegex =
      /^\s*\{\s*"[^"]+"\s*:\s*(?:"[^"]*"|[0-9]+(?:\.[0-9]+)?|\{.*\}|\[.*\]|true|false|null)\s*(,\s*"[^"]+"\s*:\s*(?:"[^"]*"|[0-9]+(?:\.[0-9]+)?|\{.*\}|\[.*\]|true|false|null)\s*)*\}\s*$/;

    // 嘗試清理回應文本，移除可能的代碼塊標記等
    let cleanedResponse = response.trim();

    // 移除開頭和結尾的 ```json 和 ``` 標記（如果有）
    if (
      cleanedResponse.startsWith("```json") ||
      cleanedResponse.startsWith("```")
    ) {
      cleanedResponse = cleanedResponse
        .replace(/^```json\s*\n|^```\s*\n|```\s*$/g, "")
        .trim();
    }

    console.log("清洗後的回應:", cleanedResponse);
    // 如果回應看起來不像 JSON 格式，直接返回無效
    if (!jsonRegex.test(cleanedResponse)) {
      result.error = "回應格式不符合 JSON 結構";
      return result;
    }

    // 嘗試解析為 JSON 對象
    const parsedData = JSON.parse(cleanedResponse);

    // 檢查 JSON 中是否包含所需的屬性
    if (
      parsedData &&
      typeof parsedData === "object" &&
      parsedData.hasOwnProperty("category") &&
      parsedData.hasOwnProperty("confidence") &&
      typeof parsedData.confidence === "number"
    ) {
      result.isValid = true;
      result.data = parsedData;
    } else {
      result.error =
        "JSON 對象缺少必要的屬性（category 和/或 confidence）或格式不正確";
    }
  } catch (parseError) {
    result.error = `JSON 解析錯誤: ${parseError.message}`;
  }

  return result;
};

/**
 * 嘗試生成 AI 回應並進行驗證，支持重試機制
 * @param {Object} chain - LangChain 的鏈
 * @param {string} formattedHistory - 格式化的對話歷史
 * @param {string} userMessage - 用戶訊息
 * @param {string} userId - 用戶 ID
 * @returns {Promise<Object>} - 包含清理後的回應和驗證結果
 */
const processAIResponseWithRetry = async (
  chain,
  formattedHistory,
  userMessage,
  userId
) => {
  // 執行鏈，最多重試 3 次來獲取有效的 JSON 回應
  let response = null;
  let validationResult = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  while (retryCount < MAX_RETRIES) {
    try {
      // 調用 AI 生成回應
      response = await chain.invoke({
        conversationHistory: formattedHistory,
        userMessage: userMessage.trim(),
      });

      logger.logMessage(`AI 回應: ${response}`, userId, "ai_raw_response");

      // 驗證回應是否為有效的 JSON 格式
      validationResult = validateAndParseJsonResponse(response);

      // 如果驗證成功，跳出循環
      if (validationResult.isValid) {
        break;
      }

      // 記錄驗證失敗信息
      logger.logMessage(
        `AI 回應驗證失敗 (第 ${retryCount + 1} 次): ${
          validationResult.error
        }，原回應: ${response}`,
        userId,
        "ai_validation_error"
      );

      // 增加重試計數
      retryCount++;

      // 如果還有重試機會，等待短暫時間後再次嘗試
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // 等待 500ms
      }
    } catch (invokeError) {
      logger.logMessage(
        `AI 回應生成失敗 (第 ${retryCount + 1} 次): ${invokeError.message}`,
        userId,
        "ai_generation_error"
      );
      retryCount++;

      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // 等待 500ms
      }
    }
  }

  // 處理最終結果
  let cleanedResponse; // 清洗後的回應
  if (validationResult && validationResult.isValid) {
    // 使用驗證後的 JSON 數據
    cleanedResponse = JSON.stringify(validationResult.data);
  } else {
    // 所有重試都失敗，返回一個預設的錯誤回應
    logger.logMessage(
      `所有 ${MAX_RETRIES} 次 AI 回應驗證都失敗，使用預設回應`,
      userId,
      "ai_validation_failed"
    );
    cleanedResponse = JSON.stringify({
      category: "未知",
      confidence: 0,
    });
  }

  return { cleanedResponse, validationResult };
};

/**
 * 根據分類結果查找對應的答案
 * @param {string} category - 分類結果
 * @param {string} userId - 用戶 ID
 * @returns {Promise<string|null>} - 找到的答案或 null
 */
const findAnswerByCategory = async (category, userId) => {
  try {
    logger.logMessage(
      `開始查詢分類 "${category}" 的答案`,
      userId,
      "db_query_start"
    );

    // 從 LevelOneQuestion 集合查詢對應的記錄
    const question = await LevelOneQuestion.findOne({
      question: category,
    }).lean();

    if (!question) {
      logger.logMessage(
        `找不到分類 "${category}" 的記錄`,
        userId,
        "db_query_empty"
      );
      return null;
    }

    logger.logMessage(
      `成功找到分類 "${category}" 的答案`,
      userId,
      "db_query_success"
    );

    return question.answer;
  } catch (error) {
    logger.logMessage(
      `查詢分類 "${category}" 的答案時出錯: ${error.message}`,
      userId,
      "db_query_error"
    );
    console.error(`查詢分類答案出錯:`, error);
    return null;
  }
};

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
      ? await getNewUserPromptTemplate()
      : await getExistingUserPromptTemplate();

    // 使用 LangChain 的聊天模型和提示模板
    const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

    // 使用重試機制來獲取有效的 JSON 回應
    const { cleanedResponse, validationResult } =
      await processAIResponseWithRetry(
        chain,
        formattedHistory,
        userMessage,
        userId
      );

    // 記錄成功生成
    logger.logMessage(
      `AI 回應: ${cleanedResponse}`,
      userId,
      "ai_response_success"
    );

    // 解析 JSON 回應，獲取分類結果
    let parsedResponse = null; // 解析後的回應
    let categoryValue = null; // 分類結果
    let confidence = null; // 信心值
    let isConfident = null; // 信心值是否大於 0.8

    try {
      parsedResponse = JSON.parse(cleanedResponse); // json 轉成 object
      categoryValue = parsedResponse?.category; // 分類結果
      confidence = parsedResponse?.confidence; // 信心值
      isConfident = confidence >= 0.85; // 信心值是否大於 0.8

      if (categoryValue) {
        logger.logMessage(
          `分類結果: ${categoryValue}, 信心值: ${
            parsedResponse.confidence || "N/A"
          }`,
          userId,
          "classification_result"
        );
      }
    } catch (parseError) {
      logger.logMessage(
        `解析 AI 回應 JSON 失敗: ${parseError.message}`,
        userId,
        "json_parse_error"
      );
      console.error("解析 JSON 失敗:", parseError);
    }

    // 根據分類結果查找對應的答案
    // 再添加用信心值加入判斷
    let answer = null; // 回復的訊息
    if (categoryValue && isConfident) {
      answer = await findAnswerByCategory(categoryValue, userId); // 到資料庫查找回答

      // 如果有答案
      if (answer) {
        logger.logMessage(
          `找到分類 "${categoryValue}" 的答案，長度: ${answer.length} 字符`,
          userId,
          "answer_found"
        );
      }
    } else {
      // 如果沒分類結果或信心值不足
      answer = await findAnswerByCategory("其他", userId); // 返回"其他" 類別的答案

      // 如果有答案
      if (answer) {
        logger.logMessage(
          `因為沒有類別或信心不足，返回分類 "其他" 類別的答案，長度: ${answer.length} 字符`,
          userId,
          "answer_found"
        );
      }
    }

    // 將對話添加到對話紀錄中
    addToConversationHistory(userId, userMessage, answer);

    // 上傳對話紀錄到資料庫(pinecone、mongoDB)
    try {
      const storeResult = await processAndStoreConversation(
        userId,
        userMessage, // 使用者提問
        answer, // 機器人回答
        {
          useTestMode: useTestMode, // 使用傳入的參數
          syncProcess: false, // 同步處理向量存儲
        }
      );
    } catch (storeError) {
      console.error("處理並存儲對話失敗:", storeError);
    }

    // 返回找到的答案或原始回應
    return answer || cleanedResponse;
  } catch (error) {
    // 記錄錯誤
    logger.logMessage(
      `生成 AI 回應失敗: ${error.message}`,
      userId,
      "ai_response_error"
    );
    console.error("生成 AI 回應失敗:", error);

    // 返回一個預設回應
    return JSON.stringify({
      category: "未知",
      confidence: 0,
    });
  }
};

// 公開方法
module.exports = {
  generateAIResponse,
};
