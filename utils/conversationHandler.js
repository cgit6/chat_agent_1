/**
 * 對話處理模塊 - 將用戶對話存儲到 MongoDB 和向量資料庫
 */
const { OpenAI } = require("openai");
const {
  enrichFaqData,
  uploadFaqToPinecone,
  createContentDigest,
  createStableId,
  testUploadWithStaticVector,
} = require("./vectorStoreHandler");
const Conversation = require("../models/Conversation");
const logger = require("./logger");
const config = require("../config");
const path = require("path");
const fs = require("fs").promises;

/**
 * 從對話中創建單個 FAQ 格式數據
 * @param {Object} conversation - 包含 question 和 answer 的對話對象
 * @returns {Object} - FAQ 格式的對象
 */
// const createFaqFromConversation = (conversation) => {
//   return {
//     question: conversation.question,
//     answer: conversation.answer,
//   };
// };

/**
 * 使用 OpenAI 豐富單個對話數據
 * @param {Object} conversation - 對話對象，包含 question 和 answer
 * @returns {Object} - 豐富後的對話數據
 */
const enrichSingleConversation = async (conversation) => {
  try {
    console.log("開始豐富對話數據...");

    // 檢查 conversation 對象是否合法
    if (!conversation || !conversation.question || !conversation.answer) {
      console.error("無效的對話數據:", conversation);
      // 返回一個基本的對象，避免後續處理出錯
      return {
        ...conversation,
        category: "未分類",
        keywords: [],
        intent: "未知",
        urgency: "中",
        audience: "所有客戶",
        actions: [],
        related_questions: [],
      };
    }

    // 初始化 OpenAI API 客戶端
    console.log("初始化 OpenAI API 客戶端...");
    const openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });

    if (!config.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY 未設置，將使用默認值");
      return {
        ...conversation,
        category: "未分類",
        keywords: [],
        intent: "未知",
        urgency: "中",
        audience: "所有客戶",
        actions: [],
        related_questions: [],
      };
    }

    // 設定 OpenAI 系統提示詞
    const systemPrompt = `
    你是一個專業的客服知識庫分析專家。請分析以下客服問答，並以純 JSON 格式提供以下額外資訊：
    
    - category: 問題所屬主題（如訂單、退貨、物流等）
    - keywords: 可用來做語意比對的關鍵字（提供 3-5 個關鍵詞數組）
    - intent: 使用者提問的主要意圖
    - urgency: 問題的緊急程度（高、中、低）
    - audience: 適用對象（如新用戶、所有客戶）
    - actions: 建議執行的動作數組（如上傳圖片、查詢出貨）
    - related_questions: 與該問題語意相近的其他常見問題數組（提供 2-3 個）
    
    重要：請確保回覆是原始 JSON 格式，不要添加任何反引號（\`）、代碼塊標記（\`\`\`）或其他非 JSON 字符。不要添加任何解釋文字。只回傳一個有效的 JSON 對象。
    `;

    // 構建 OpenAI API 的請求
    const userPrompt = `問題: ${conversation.question}\n答案: ${conversation.answer}`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125", // 使用較輕量的模型以節省成本
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // 低溫度，更確定性的輸出
    });

    // 解析 OpenAI 回應中的 JSON 資料
    try {
      const contentText = response.choices[0].message.content.trim(); // 整理返回的訊息

      // 嘗試移除可能存在的反引號格式化
      let cleanedContent = contentText;
      // 移除 Markdown 風格的代碼塊標記
      if (
        cleanedContent.startsWith("```json") ||
        cleanedContent.startsWith("```")
      ) {
        cleanedContent = cleanedContent.replace(
          /^```json\s*\n|^```\s*\n|```\s*$/g,
          ""
        );
      }
      // 移除單行反引號
      if (cleanedContent.startsWith("`") && cleanedContent.endsWith("`")) {
        cleanedContent = cleanedContent.slice(1, -1);
      }

      const enrichment = JSON.parse(cleanedContent); // 解析 JSON 字串
      //   console.log(">>>enrichment: ", enrichment);

      // 返回豐富後的數據（展平結構）
      return {
        ...conversation,
        category: enrichment.category || "未分類",
        keywords: enrichment.keywords || [],
        intent: enrichment.intent || "未知",
        urgency: enrichment.urgency || "中",
        audience: enrichment.audience || "所有客戶",
        actions: enrichment.actions || [],
        related_questions: enrichment.related_questions || [],
      };
    } catch (parseError) {
      logger.logMessage(
        `解析 OpenAI 回應失敗: ${parseError.message}, 原始回應: ${response.choices[0].message.content}`,
        "system",
        "enrichment_error"
      );
      console.error("解析 OpenAI 回應失敗:", parseError);

      // 返回原始數據，但添加空屬性（展平結構）
      return {
        ...conversation,
        category: "未分類",
        keywords: [],
        intent: "未知",
        urgency: "中",
        audience: "所有客戶",
        actions: [],
        related_questions: [],
      };
    }
  } catch (error) {
    logger.logMessage(
      `豐富對話數據失敗: ${error.message}`,
      "system",
      "enrichment_error"
    );
    console.error("豐富對話數據失敗:", error);

    // 返回原始數據，但添加空屬性（展平結構）
    return {
      ...conversation,
      category: "未分類",
      keywords: [],
      intent: "未知",
      urgency: "中",
      audience: "所有客戶",
      actions: [],
      related_questions: [],
    };
  }
};

/**
 * 將對話存儲到 MongoDB
 * @param {string} userId - 用戶ID
 * @param {string} question - 用戶問題
 * @param {string} answer - 機器人回答
 * @returns {Promise<Object>} - 存儲的對話文檔
 */
const storeConversationToMongoDB = async (userId, question, answer) => {
  try {
    // 1.創建基本對話數據
    const conversationData = {
      userId, // 用戶id
      question, // 用戶問題
      answer, // 機器人回答
    };

    // 2.豐富對話數據
    const enrichedData = await enrichSingleConversation(conversationData);

    // 3.創建新的對話文檔（直接使用展平結構）
    const conversation = new Conversation(enrichedData);

    // 4. 保存到 MongoDB
    const savedConversation = await conversation.save();
    logger.logMessage(`對話已存儲到 MongoDB`, userId, "conversation_stored");

    return savedConversation; // 返回保存的對話文檔
  } catch (error) {
    logger.logMessage(
      `存儲對話到 MongoDB 失敗: ${error.message}`,
      userId,
      "mongodb_error"
    );
    console.error("存儲對話到 MongoDB 失敗:", error);
    throw error;
  }
};

/**
 * 將對話存儲到 pinecone 向量資料庫
 * @param {Object} conversation - 已存儲的對話文檔
 * @param {boolean} useTestUpload - 是否使用測試上傳函數（跳過 OpenAI Embeddings）
 * @returns {Promise<Object>} - 結果對象
 */
const storeConversationToVectorDB = async (
  conversation,
  useTestUpload = false
) => {
  try {
    console.log("開始將對話存儲到向量資料庫...");
    console.log("使用測試上傳模式:", useTestUpload ? "是" : "否");

    // 檢查 conversation 物件是否有效
    if (!conversation || typeof conversation !== "object") {
      throw new Error("無效的對話物件");
    }

    // 檢查必要屬性
    if (!conversation._id) {
      console.warn("對話缺少 _id，可能影響後續更新操作");
    }

    console.log("對話內容:", {
      id: conversation._id || "未知ID",
      question: conversation.question
        ? conversation.question.substring(0, 30) + "..."
        : "未提供問題",
      answer: conversation.answer
        ? conversation.answer.substring(0, 30) + "..."
        : "未提供答案",
    });

    // 1. 將對話轉換為 FAQ 格式，確保所有欄位類型正確
    const faq = {
      question: conversation.question || "",
      answer: conversation.answer || "",
      category: conversation.category || "未分類",
      keywords: Array.isArray(conversation.keywords)
        ? conversation.keywords
        : [],
      intent: conversation.intent || "未知",
      urgency: conversation.urgency || "中",
      audience: conversation.audience || "所有客戶",
      actions: Array.isArray(conversation.actions) ? conversation.actions : [],
      related_questions: Array.isArray(conversation.related_questions)
        ? conversation.related_questions
        : [],
    };

    console.log("已處理的 FAQ 格式:", JSON.stringify(faq, null, 2));

    // 檢查必填欄位
    if (!faq.question || !faq.answer) {
      throw new Error("FAQ 必須包含問題和答案");
    }

    // 計算內容摘要，用於後續更新
    let contentDigestValue;
    try {
      // 根據模式選擇使用固定摘要還是計算摘要
      contentDigestValue = useTestUpload
        ? "test_digest_123"
        : createContentDigest(faq);
      console.log("內容摘要計算成功:", contentDigestValue);
    } catch (digestError) {
      console.error("計算內容摘要失敗:", digestError);
      // 使用時間戳作為備用摘要
      contentDigestValue = "error_digest_" + Date.now();
    }

    // 3. 根據模式選擇上傳方法
    console.log(`開始調用 ${useTestUpload ? "測試上傳" : "標準上傳"} 函數...`);
    let result;
    try {
      if (useTestUpload) {
        // 使用測試上傳函數，跳過 OpenAI Embeddings 生成步驟
        result = await testUploadWithStaticVector(faq);
      } else {
        // 使用標準上傳函數
        result = await uploadFaqToPinecone(faq);
      }
      console.log("上傳調用結果:", result ? "成功" : "失敗");
    } catch (uploadError) {
      console.error("上傳到向量資料庫失敗:", uploadError.message);
      // 不中斷流程，返回錯誤信息
      return {
        success: false,
        message: `上傳到向量資料庫失敗: ${uploadError.message}`,
        error: uploadError,
      };
    }

    // 4. 更新 Conversation 文檔
    if (result && result.success) {
      try {
        // 提取向量 ID
        let vectorId;
        if (useTestUpload && result.faqId) {
          vectorId = result.faqId;
        } else {
          vectorId = `faq_${createStableId(faq.question)}`;
        }
        console.log("向量 ID:", vectorId);

        // 確保 conversation._id 存在
        if (!conversation._id) {
          console.warn("對話缺少 _id，無法更新 MongoDB 記錄");
          return {
            success: true,
            message: "向量上傳成功，但無法更新 MongoDB 記錄",
            result: result,
          };
        }

        // 更新文檔
        await Conversation.findByIdAndUpdate(conversation._id, {
          $set: {
            vectorId: vectorId,
            isVectorized: true,
            contentDigest: contentDigestValue,
          },
        });
        console.log("Conversation 文檔已更新，標記為已向量化");

        logger.logMessage(
          `對話已存儲到向量資料庫，向量 ID: ${vectorId}`,
          conversation.userId || "unknown",
          "vector_stored"
        );

        return {
          success: true,
          message: "對話成功存儲到向量資料庫並更新MongoDB記錄",
          vectorId: vectorId,
          result: result,
        };
      } catch (updateError) {
        console.error("更新 Conversation 文檔失敗:", updateError.message);
        logger.logMessage(
          `更新對話文檔失敗: ${updateError.message}`,
          conversation.userId || "unknown",
          "mongodb_update_error"
        );

        return {
          success: true,
          message: "向量上傳成功，但MongoDB更新失敗",
          error: updateError.message,
          result: result,
        };
      }
    } else {
      console.warn("向量更新未成功，無法更新 Conversation 文檔");
      logger.logMessage(
        `向量更新未成功，結果: ${JSON.stringify(result || {})}`,
        conversation.userId || "unknown",
        "vector_update_warning"
      );

      return {
        success: false,
        message: "向量更新未成功",
        result: result || { error: "未知錯誤" },
      };
    }
  } catch (error) {
    console.error("存儲對話到向量資料庫失敗，詳細錯誤:");
    console.error("錯誤名稱:", error.name);
    console.error("錯誤消息:", error.message);
    console.error("錯誤堆棧:", error.stack);

    logger.logMessage(
      `存儲對話到向量資料庫失敗: ${error.message}`,
      conversation?.userId || "unknown",
      "vector_error"
    );

    return {
      success: false,
      message: `存儲失敗: ${error.message}`,
      error: error.message,
    };
  }
};

/**
 * 處理並存儲 (pinecone) 用戶對話
 * @param {string} userId - 用戶ID
 * @param {string} question - 用戶問題
 * @param {string} answer - 機器人回答
 * @param {object} options - 選項
 * @param {boolean} options.useTestMode - 是否使用測試模式上傳到向量資料庫
 * @param {boolean} options.syncProcess - 是否同步處理向量存儲（不使用setTimeout）
 * @returns {Promise<Object>} - 處理結果
 */
const processAndStoreConversation = async (
  userId,
  question,
  answer,
  options = {}
) => {
  try {
    const { useTestMode = false, syncProcess = false } = options;
    console.log("處理並存儲用戶對話，測試模式:", useTestMode ? "開啟" : "關閉");
    console.log("同步處理向量存儲:", syncProcess ? "是" : "否");

    // 1. 存儲到 MongoDB
    console.log(`開始將對話存儲到 MongoDB, 用戶: ${userId}`);
    const savedConversation = await storeConversationToMongoDB(
      userId,
      question,
      answer
    );
    console.log(`對話已存儲到 MongoDB, 文檔 ID: ${savedConversation._id}`);

    // 2. 存儲到向量資料庫
    if (syncProcess) {
      // 同步處理
      console.log("正在同步處理向量存儲...");
      try {
        const vectorResult = await storeConversationToVectorDB(
          savedConversation,
          useTestMode
        );
        console.log("向量存儲結果:", vectorResult);

        // 如果成功向量化，添加到返回結果
        return {
          success: true,
          message: "對話已成功處理並存儲",
          conversation: savedConversation,
          vectorResult: vectorResult,
        };
      } catch (vectorError) {
        console.error("向量存儲處理錯誤:", vectorError);
        logger.logMessage(
          `向量存儲處理錯誤: ${vectorError.message}`,
          userId,
          "vector_error"
        );
        // 即使向量存儲失敗也返回成功，因為MongoDB存儲已成功
        return {
          success: true,
          message: "對話已存儲到 MongoDB，但向量存儲失敗",
          conversation: savedConversation,
          vectorError: vectorError.message,
        };
      }
    } else {
      // 非同步處理 (使用 setTimeout 避免阻塞主流程)
      console.log("將使用非同步方式處理向量存儲...");
      setTimeout(async () => {
        try {
          const vectorResult = await storeConversationToVectorDB(
            savedConversation,
            useTestMode
          ); // 存到向量資料庫
          console.log("非同步向量存儲結果:", vectorResult);
        } catch (error) {
          console.error("非同步向量存儲後台處理錯誤:", error);
        }
      }, 1000);

      return {
        success: true,
        message: "對話已存儲到 MongoDB，向量存儲正在後台處理",
        conversation: savedConversation,
      };
    }
  } catch (error) {
    logger.logMessage(
      `處理對話失敗: ${error.message}`,
      userId,
      "process_error"
    );
    console.error("處理對話失敗:", error);
    return {
      success: false,
      message: `處理失敗: ${error.message}`,
      error: error,
    };
  }
};

// 公開方法
module.exports = {
  processAndStoreConversation,
  storeConversationToMongoDB,
  storeConversationToVectorDB,
};
