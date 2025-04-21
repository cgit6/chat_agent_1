/**
 * AI 回應處理模塊 - 使用 LangChain 和 Gemini 處理用戶消息
 */
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const config = require("../config");
const logger = require("./logger");

// 存儲用戶對話歷史的簡單內存緩存
const conversationHistory = new Map();

// 對話歷史的最大長度（幾輪對話）
const MAX_HISTORY_LENGTH = 5;

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
    timestamp: new Date().toISOString()
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
  
  return history.map(entry => 
    `用戶: ${entry.user}\n機器人: ${entry.bot}`
  ).join('\n\n');
};

/**
 * 處理用戶消息並使用 Gemini 生成回應
 * @param {string} userId - 用戶ID
 * @param {string} userMessage - 用戶消息
 * @param {object} options - 選項
 * @returns {Promise<string>} - AI 生成的回應
 */
const generateAIResponse = async (userId, userMessage, options = {}) => {
  try {
    // 記錄請求
    logger.logMessage(`正在生成對用戶 ${userId} 消息的 AI 回應`, userId, "ai_processing");
    
    const model = initGeminiModel();
    const history = getConversationHistory(userId);
    const formattedHistory = formatConversationHistory(history);
    
    // 創建提示模板，包含對話歷史和最新消息
    const promptTemplate = PromptTemplate.fromTemplate(`
      你是一個親切友好的 Facebook Messenger 聊天機器人助手，名叫「小助手」，能夠理解並回應用戶的需求。
      
      以下是你與用戶的對話歷史（如果有）：
      
      {conversationHistory}
      
      用戶的最新消息: {userMessage}
      
      請根據以上信息回應用戶，注意以下要求：
      1. 回應必須使用繁體中文
      2. 保持友好、親切的語氣
      3. 回應應簡潔明瞭，通常不超過3-4句話
      4. 避免重複用戶提供的信息
      5. 如果不確定答案，誠實表達，不要編造信息
      6. 嘗試解決用戶的問題或回答他們的問題
      
      回應:
    `);
    
    // 創建鏈
    const chain = promptTemplate
      .pipe(model)
      .pipe(new StringOutputParser());
    
    // 執行鏈
    const response = await chain.invoke({
      conversationHistory: formattedHistory,
      userMessage: userMessage.trim(),
    });
    
    const cleanedResponse = response.trim();
    
    // 將對話添加到歷史
    addToConversationHistory(userId, userMessage, cleanedResponse);
    
    // 記錄成功生成
    logger.logMessage(`成功生成 AI 回應`, userId, "ai_response_success");
    
    return cleanedResponse;
  } catch (error) {
    // 記錄錯誤
    logger.logMessage(`生成 AI 回應失敗: ${error.message}`, userId, "ai_response_error");
    console.error("生成 AI 回應失敗:", error);
    
    // 返回一個預設回應
    return "抱歉，我現在無法回應您的問題。請稍後再試。";
  }
};

// 公開方法
module.exports = {
  generateAIResponse
}; 