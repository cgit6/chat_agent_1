/**
 * 向量資料庫處理模組 - 將 FAQ 資料上傳到 Pinecone
 */
const { OpenAIEmbeddings } = require("@langchain/openai");
const { OpenAI } = require("openai");
const { Pinecone } = require("@pinecone-database/pinecone");
const fs = require("fs").promises;
const path = require("path");
const config = require("../config");
const logger = require("./logger");
const { v4: uuidv4 } = require("uuid");

// 初始化 Pinecone 客戶端
const initPinecone = async () => {
  try {
    console.log("開始初始化 Pinecone 客戶端...");

    const pineconeApiKey = config.PINECONE_API_KEY;
    const pineconeIndexName = config.PINECONE_INDEX_NAME;

    console.log("配置資訊:");
    console.log(`- API 金鑰: ${pineconeApiKey ? "已設置" : "未設置"}`);
    console.log(`- 索引名稱: ${pineconeIndexName || "未設置"}`);

    if (!pineconeApiKey || !pineconeIndexName) {
      throw new Error("Pinecone 配置缺失，請檢查環境變數");
    }

    console.log("創建 Pinecone 實例...");
    const pinecone = new Pinecone({
      apiKey: pineconeApiKey,
    });

    console.log("連接到索引:", pineconeIndexName);
    const index = pinecone.Index(pineconeIndexName);

    // 簡單測試索引連接
    console.log("測試索引連接...");
    try {
      const stats = await index.describeIndexStats();
      console.log("索引連接成功，統計資訊:", {
        dimension: stats.dimension,
        namespaces: Object.keys(stats.namespaces || {}).length,
        vectorCount: stats.totalVectorCount,
      });
    } catch (testError) {
      console.warn("索引連接測試失敗，但將繼續嘗試使用:", testError.message);
    }

    console.log("Pinecone 客戶端初始化成功");
    return index;
  } catch (error) {
    console.error("初始化 Pinecone 失敗，詳細錯誤:");
    console.error("錯誤名稱:", error.name);
    console.error("錯誤消息:", error.message);
    console.error("錯誤堆棧:", error.stack);

    if (error.message.includes("API key")) {
      console.error("API 金鑰錯誤，請檢查 PINECONE_API_KEY 環境變數");
    }

    if (error.message.includes("index") || error.message.includes("Index")) {
      console.error(
        "索引錯誤，請檢查 PINECONE_INDEX_NAME 環境變數和索引是否存在"
      );
    }

    throw error;
  }
};

// 初始化 OpenAI Embeddings
const initEmbeddings = () => {
  try {
    const apiKey = config.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 未設置，請在環境變量中添加");
    }

    return new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      model: "text-embedding-ada-002", // 或較新的模型
    });
  } catch (error) {
    console.error("初始化 OpenAI Embeddings 失敗:", error.message);
    throw error;
  }
};

// 讀取 FAQ JSON 檔案
const readFaqJson = async () => {
  try {
    const filePath = path.join(__dirname, "../data/temp_conversation_faq.json"); // 臨時對話FAQ
    const data = await fs.readFile(filePath, "utf8"); // 讀取檔案
    return JSON.parse(data); // 轉成物件
  } catch (error) {
    console.error("讀取 FAQ JSON 失敗:", error.message);
    throw error;
  }
};

/**
 * 使用 OpenAI 豐富 FAQ 資料，添加分類、關鍵字等額外資訊
 */
const enrichFaqData = async () => {
  try {
    console.log("開始使用 OpenAI 豐富 FAQ 資料...");

    // 1. 讀取原始 FAQ 資料
    const faqData = await readFaqJson();
    console.log(`讀取到 ${faqData.length} 條原始 FAQ 資料`);

    // 2. 初始化 OpenAI API 客戶端
    const openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });

    // 3. 設定 OpenAI 系統提示詞
    const systemPrompt = `
    你是一個專業的客服知識庫分析專家。請分析以下客服問答，並以 JSON 格式提供以下額外資訊：
    
    - category: 問題所屬主題（如訂單、退貨、物流等）
    - keywords: 可用來做語意比對的關鍵字（提供 3-5 個關鍵詞數組）
    - intent: 使用者提問的主要意圖
    - urgency: 問題的緊急程度（高、中、低）
    - audience: 適用對象（如新用戶、所有客戶）
    - actions: 建議執行的動作數組（如上傳圖片、查詢出貨）
    - related_questions: 與該問題語意相近的其他常見問題數組（提供 2-3 個）
    
    請確保回覆是有效的 JSON 格式，只包含上述欄位，不要添加額外解釋。`;

    // 4. 批次處理 FAQ 資料
    const enrichedFaqData = [];
    const batchSize = 5; // 避免並發過多請求

    // 批次處理 FAQ 資料
    for (let i = 0; i < faqData.length; i += batchSize) {
      const batch = faqData.slice(i, i + batchSize);
      const batchPromises = batch.map(async (faq) => {
        console.log(`處理 FAQ #${i + batch.indexOf(faq) + 1}: ${faq.question}`);

        // 構建 OpenAI API 的請求
        const userPrompt = `問題: ${faq.question}\n答案: ${faq.answer}`;

        const response = await openai.chat.completions.create({
          model: "gpt-4", // 或使用其他合適的模型
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3, // 低溫度，更確定性的輸出
        });

        // 解析 OpenAI 回應中的 JSON 資料
        try {
          const contentText = response.choices[0].message.content.trim();
          const enrichment = JSON.parse(contentText);

          // 合併原始資料與豐富資料
          return {
            ...faq,
            ...enrichment,
          };
        } catch (parseError) {
          console.error(
            `解析 FAQ #${i + batch.indexOf(faq) + 1} 的 OpenAI 回應失敗:`,
            parseError
          );
          // 返回原始資料，但添加空屬性
          return {
            ...faq,
            category: "未分類",
            keywords: [],
            intent: "未知",
            urgency: "中",
            audience: "所有客戶",
            actions: [],
            related_questions: [],
          };
        }
      });

      // 等待當前批次全部處理完成
      const batchResults = await Promise.all(batchPromises);
      enrichedFaqData.push(...batchResults);

      // 添加延遲避免 API 速率限制
      if (i + batchSize < faqData.length) {
        console.log("等待 API 速率限制...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // 5. 儲存豐富後的 FAQ 資料到檔案
    const enrichedFilePath = path.join(
      __dirname,
      "../data/customer_service_faq_enriched.json"
    );
    await fs.writeFile(
      enrichedFilePath,
      JSON.stringify(enrichedFaqData, null, 2),
      "utf8"
    );
    console.log(`已儲存豐富後的 FAQ 資料到 ${enrichedFilePath}`);

    return enrichedFaqData;
  } catch (error) {
    console.error("豐富 FAQ 資料失敗:", error.message);
    throw error;
  }
};

// 修改上傳函數，增加一個處理步驟(enrichFaqData)
const uploadEnrichedFaqToPinecone = async () => {
  try {
    // 先豐富資料
    const enrichedFaqData = await enrichFaqData(); // 豐富後的資料

    // 創建一個新的上傳函數，使用豐富後的資料
    const uploadEnrichedData = async () => {
      // 使用閉包而非修改常數
      const pineconeIndex = await initPinecone(); // 初始化 Pinecone 客戶端
      const embeddings = initEmbeddings(); // 初始化 OpenAI Embeddings

      console.log("開始增量上傳豐富後的 FAQ 到 Pinecone...");
      console.log(`處理 ${enrichedFaqData.length} 條 FAQ 資料`);

      // 查詢現有 FAQ...
      const existingFaqs = await fetchExistingFaqs(pineconeIndex);
      console.log(`找到 ${existingFaqs.size} 條現有 FAQ`);

      // 準備資料...
      const vectorsToUpsert = [];
      const vectorsToDelete = [];
      const idsToKeep = new Set();

      // 處理資料...
      for (let i = 0; i < enrichedFaqData.length; i++) {
        const faq = enrichedFaqData[i];

        // 原有的處理邏輯...
        const faqId = `faq_${createStableId(faq.question)}`;
        idsToKeep.add(faqId);

        const contentDigest = createContentDigest(faq);
        const existingFaq = existingFaqs.get(faqId);
        const needsUpdate =
          !existingFaq || existingFaq.digest !== contentDigest;

        if (needsUpdate) {
          // 合併問題和答案以創建完整文本
          const fullText = `${faq.question} ${faq.answer}`;

          // 生成向量嵌入
          const [vectorEmbedding] = await embeddings.embedDocuments([fullText]);

          // 調整向量維度
          const resizedVector = resizeVector(vectorEmbedding, 1024);

          // 準備向量記錄
          vectorsToUpsert.push({
            id: faqId,
            values: resizedVector,
            metadata: {
              ...faq, // 使用所有豐富後的欄位
              contentDigest: contentDigest,
            },
          });

          console.log(
            `FAQ #${i + 1}: "${faq.question.substring(0, 30)}..." 需要 ${
              existingFaq ? "更新" : "創建"
            }`
          );
        } else {
          console.log(
            `FAQ #${i + 1}: "${faq.question.substring(0, 30)}..." 無變化，跳過`
          );
        }
      }

      // 找出 Pinecone 中存在但新資料中不存在的 FAQ ID (已刪除的 FAQ)
      for (const [existingId] of existingFaqs) {
        if (!idsToKeep.has(existingId)) {
          vectorsToDelete.push(existingId);
          console.log(`找到已刪除的 FAQ：${existingId}`);
        }
      }

      // 批次上傳新的或變化的向量
      if (vectorsToUpsert.length > 0) {
        console.log(`上傳 ${vectorsToUpsert.length} 條新的或修改過的向量...`);
        await pineconeIndex.upsert(vectorsToUpsert);
        console.log("上傳完成！");
      } else {
        console.log("沒有新的或修改過的向量需要上傳");
      }

      // 刪除不再存在的向量
      if (vectorsToDelete.length > 0) {
        console.log(`刪除 ${vectorsToDelete.length} 條不再使用的向量...`);
        await pineconeIndex.delete({
          ids: vectorsToDelete,
        });
        console.log("刪除完成！");
      }

      // 返回結果
      return {
        success: true,
        message: `成功處理 FAQ 數據：上傳 ${vectorsToUpsert.length} 條，刪除 ${vectorsToDelete.length} 條`,
        total: enrichedFaqData.length,
        updated: vectorsToUpsert.length,
        deleted: vectorsToDelete.length,
      };
    };

    // 執行上傳
    return await uploadEnrichedData(); // 上傳到 Pinecone 中
  } catch (error) {
    console.error("上傳豐富後的 FAQ 失敗:", error);
    return {
      success: false,
      message: `上傳失敗: ${error.message}`,
      error: error,
    };
  }
};

// 將 FAQ (物件)轉換為向量並上傳到 Pinecone(現在這種做法會使 Pinecone 的向量資料庫與本地的文本保持一致)
// 直接將傳入的 FAQ 物件轉換為物件並上傳到 Pinecone

/**
 *
 *question: conversation.question,
 *answer: conversation.answer,
 *category: conversation.category,
 *keywords: conversation.keywords,
 *intent: conversation.intent,
 *urgency: conversation.urgency,
 *audience: conversation.audience,
 *actions: conversation.actions,
 *related_questions: conversation.related_questions,
 */
const uploadFaqToPinecone = async (directFaq = null) => {
  try {
    console.log("開始增量上傳 FAQ 到 Pinecone...");

    // 初始化
    console.log("正在初始化 Pinecone 客戶端...");
    const pineconeIndex = await initPinecone();
    console.log("Pinecone 客戶端初始化成功");

    console.log("正在初始化 OpenAI Embeddings...");
    const embeddings = initEmbeddings();
    console.log("OpenAI Embeddings 初始化成功");

    // 如果直接提供了 faq 物件，使用它；否則讀取文件
    console.log("directFaq: ", directFaq); // 傳入的 FAQ 物件

    let faqData;
    if (directFaq) {
      console.log("使用直接提供的 FAQ 物件");
      // 確保 FAQ 物件結構正確
      const sanitizedFaq = {
        question: directFaq.question || "",
        answer: directFaq.answer || "",
        category: directFaq.category || "未分類",
        keywords: Array.isArray(directFaq.keywords) ? directFaq.keywords : [],
        intent: directFaq.intent || "未知",
        urgency: directFaq.urgency || "中",
        audience: directFaq.audience || "所有客戶",
        actions: Array.isArray(directFaq.actions) ? directFaq.actions : [],
        related_questions: Array.isArray(directFaq.related_questions)
          ? directFaq.related_questions
          : [],
      };

      console.log("已處理的 FAQ 物件:", JSON.stringify(sanitizedFaq, null, 2));
      faqData = [sanitizedFaq];
    } else {
      console.log("從檔案讀取 FAQ 資料");
      faqData = await readFaqJson();
    }

    console.log(`讀取到 ${faqData.length} 條 FAQ 資料`);

    // 1. 先查詢 Pinecone 中的現有資料
    console.log("查詢 Pinecone 中的現有 FAQ...");
    const existingFaqs = await fetchExistingFaqs(pineconeIndex); // 獲取 Pinecone 中的現有 FAQ 資料
    console.log(`找到 ${existingFaqs.size} 條現有 FAQ`);

    // 2. 準備批次上傳的數據
    const vectorsToUpsert = []; // 需要上傳的向量資料
    const vectorsToDelete = []; // 需要刪除的向量資料

    // 3. 標記哪些 ID 需要保留（防止後面刪除）
    const idsToKeep = new Set();

    // 遍歷所有 FAQ 資料
    for (let i = 0; i < faqData.length; i++) {
      try {
        const faq = faqData[i];

        // 為每個問題創建穩定的 ID (不使用 UUID)
        const faqId = `faq_${createStableId(faq.question)}`;
        idsToKeep.add(faqId);

        // 創建當前 FAQ 的內容摘要以檢測變化
        const contentDigest = createContentDigest(faq);

        // 檢查是否需要更新
        const existingFaq = existingFaqs.get(faqId); // 用 faqId 抓取資料
        const needsUpdate =
          !existingFaq || existingFaq.digest !== contentDigest; //

        // 如果需要更新，則進行更新
        if (needsUpdate) {
          // 合併問題和答案以創建完整文本
          const fullText = `${faq.question} ${faq.answer}`;
          console.log(
            `處理 FAQ #${i + 1}: "${faq.question.substring(
              0,
              30
            )}..." 的向量嵌入`
          );

          try {
            // 生成向量嵌入
            const [vectorEmbedding] = await embeddings.embedDocuments([
              fullText,
            ]);

            // 調整向量維度
            const resizedVector = resizeVector(vectorEmbedding, 1024);
            console.log(`成功生成向量嵌入，維度: ${resizedVector.length}`);

            // 準備向量記錄
            // 確保每個欄位都是正確的類型
            const keywords = Array.isArray(faq.keywords)
              ? faq.keywords.join(", ")
              : "";
            const actions = Array.isArray(faq.actions)
              ? faq.actions.join(", ")
              : "";
            const related_questions = Array.isArray(faq.related_questions)
              ? faq.related_questions.join(", ")
              : "";

            vectorsToUpsert.push({
              id: faqId,
              values: resizedVector,
              metadata: {
                question: faq.question || "",
                answer: faq.answer || "",
                category: faq.category || "未分類",
                keywords: keywords,
                intent: faq.intent || "未知",
                urgency: faq.urgency || "中",
                audience: faq.audience || "所有客戶",
                actions: actions,
                related_questions: related_questions,
                contentDigest: contentDigest, // 存儲內容摘要用於後續比較
              },
            });

            console.log(
              `FAQ #${i + 1}: "${faq.question.substring(0, 30)}..." 需要 ${
                existingFaq ? "更新" : "創建"
              }`
            );
          } catch (embeddingError) {
            console.error(`生成 FAQ #${i + 1} 的向量嵌入失敗:`, embeddingError);
            logger.logMessage(
              `生成 FAQ 向量嵌入失敗: ${embeddingError.message}`,
              "system",
              "embedding_error"
            );
          }
        } else {
          console.log(
            `FAQ #${i + 1}: "${faq.question.substring(0, 30)}..." 無變化，跳過`
          );
        }
      } catch (faqProcessError) {
        console.error(`處理 FAQ #${i + 1} 失敗:`, faqProcessError);
        logger.logMessage(
          `處理 FAQ 失敗: ${faqProcessError.message}`,
          "system",
          "faq_process_error"
        );
      }
    }

    // 4. 找出 Pinecone 中存在但新資料中不存在的 FAQ ID (已刪除的 FAQ)
    for (const [existingId] of existingFaqs) {
      if (!idsToKeep.has(existingId)) {
        vectorsToDelete.push(existingId);
        console.log(`找到已刪除的 FAQ：${existingId}`);
      }
    }

    // 5. 批次上傳新的或變化的向量
    if (vectorsToUpsert.length > 0) {
      console.log(`上傳 ${vectorsToUpsert.length} 條新的或修改過的向量...`);
      try {
        await pineconeIndex.upsert(vectorsToUpsert);
        console.log("上傳完成！");
      } catch (upsertError) {
        console.error("上傳向量失敗:", upsertError);
        logger.logMessage(
          `上傳向量失敗: ${upsertError.message}`,
          "system",
          "vector_upsert_error"
        );
        throw upsertError; // 重新拋出以便被外層捕獲
      }
    } else {
      console.log("沒有新的或修改過的向量需要上傳");
    }

    // 6. 刪除不再存在的向量
    if (vectorsToDelete.length > 0) {
      console.log(`刪除 ${vectorsToDelete.length} 條不再使用的向量...`);
      try {
        await pineconeIndex.delete({
          ids: vectorsToDelete,
        });
        console.log("刪除完成！");
      } catch (deleteError) {
        console.error("刪除向量失敗:", deleteError);
        logger.logMessage(
          `刪除向量失敗: ${deleteError.message}`,
          "system",
          "vector_delete_error"
        );
      }
    }

    return {
      success: true,
      message: `成功處理 FAQ 數據：上傳 ${vectorsToUpsert.length} 條，刪除 ${vectorsToDelete.length} 條`,
      total: faqData.length,
      updated: vectorsToUpsert.length,
      deleted: vectorsToDelete.length,
    };
  } catch (error) {
    console.error("上傳 FAQ 到 Pinecone 失敗，詳細錯誤:");
    console.error("錯誤名稱:", error.name);
    console.error("錯誤消息:", error.message);
    console.error("錯誤堆棧:", error.stack);

    logger.logMessage(
      `上傳 FAQ 到 Pinecone 失敗: ${error.message}`,
      "system",
      "pinecone_upload_error"
    );

    return {
      success: false,
      message: `上傳失敗: ${error.message}`,
      error: error,
    };
  }
};

// 從 Pinecone 獲取所有現有的 FAQ 數據
async function fetchExistingFaqs(pineconeIndex) {
  try {
    console.log("開始從 Pinecone 獲取現有 FAQ 數據...");
    console.log("Pinecone 索引狀態:", pineconeIndex ? "已初始化" : "未初始化");

    if (!pineconeIndex) {
      throw new Error("Pinecone 索引為空，請檢查初始化過程");
    }

    console.log("準備發送 fetch 請求到 Pinecone...");
    console.log(
      "請求參數:",
      JSON.stringify({
        ids: [],
        includeMetadata: true,
      })
    );

    // 查詢所有向量
    const response = await pineconeIndex.fetch({
      ids: [], // 空數組會返回所有向量
      includeMetadata: true,
    });

    console.log("成功獲取 Pinecone 回應");
    console.log(
      "回應包含向量數量:",
      Object.keys(response.vectors || {}).length
    );

    // 創建 ID -> {digest, metadata} 的映射
    const faqMap = new Map();

    if (!response.vectors) {
      console.warn("Pinecone 回應中沒有 vectors 數據");
      return faqMap;
    }

    for (const [id, data] of Object.entries(response.vectors)) {
      // 只處理 FAQ 向量 (檢查 ID 前綴或元數據)
      if (id.startsWith("faq_") && data.metadata) {
        faqMap.set(id, {
          digest: data.metadata.contentDigest || "",
          metadata: data.metadata,
        });
      }
    }

    console.log(`成功處理 Pinecone 數據，找到 ${faqMap.size} 條 FAQ 向量`);
    return faqMap;
  } catch (error) {
    console.error("獲取現有 FAQ 失敗，詳細錯誤:");
    console.error("錯誤名稱:", error.name);
    console.error("錯誤消息:", error.message);
    console.error("錯誤堆棧:", error.stack);

    // 檢查是否為網絡錯誤
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error("網絡連接問題，無法連接到 Pinecone 服務");
    }

    // 檢查是否為授權錯誤
    if (
      error.status === 401 ||
      (error.response && error.response.status === 401)
    ) {
      console.error("授權錯誤，請檢查 Pinecone API 金鑰是否正確");
    }

    // 檢查是否為 Pinecone 特定錯誤
    if (error.message && error.message.includes("Pinecone")) {
      console.error("Pinecone 特定錯誤，請檢查 Pinecone 配置和狀態");
    }

    // 記錄到系統日誌
    logger.logMessage(
      `獲取 Pinecone FAQ 失敗: ${error.message}`,
      "system",
      "pinecone_error"
    );

    return new Map(); // 如果出錯，返回空映射
  }
}

// 為問題創建穩定的 ID
function createStableId(question) {
  // 簡單的哈希函數實現
  let hash = 0;
  const str = question.toLowerCase().trim();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 轉為 32-bit 整數
  }
  return Math.abs(hash).toString(16); // 轉為十六進制字符串
}

// 創建內容摘要 (用於檢測內容是否變化)
function createContentDigest(faq) {
  // 將所有相關字段組合成一個字符串
  const content = JSON.stringify({
    question: faq.question,
    answer: faq.answer,
    category: faq.category,
    keywords: faq.keywords,
    intent: faq.intent,
    urgency: faq.urgency,
    audience: faq.audience,
    actions: faq.actions,
    related_questions: faq.related_questions,
  });

  // 創建哈希值
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// 從 Pinecone 查詢最相關的 FAQ
const queryFaq = async (queryText, limit = 3) => {
  try {
    const pineconeIndex = await initPinecone();
    const embeddings = initEmbeddings();

    // 生成查詢向量
    const [queryVector] = await embeddings.embedDocuments([queryText]);

    // 調整查詢向量維度
    const resizedQueryVector = resizeVector(queryVector, 1024);

    // 查詢 Pinecone
    const queryResponse = await pineconeIndex.query({
      vector: resizedQueryVector,
      topK: limit,
      includeMetadata: true,
    });

    return queryResponse.matches.map((match) => ({
      question: match.metadata.question,
      answer: match.metadata.answer,
      category: match.metadata.category,
      score: match.score,
    }));
  } catch (error) {
    console.error("查詢 FAQ 失敗:", error);
    throw error;
  }
};

// 添加這個新函數到文件中
function resizeVector(vector, targetDimension) {
  // 檢查向量是否為陣列並且有長度
  if (!Array.isArray(vector)) {
    console.error("向量不是陣列:", vector);
    throw new Error("向量嵌入必須是陣列");
  }

  if (vector.length === 0) {
    console.error("向量嵌入陣列為空");
    throw new Error("向量嵌入陣列不能為空");
  }

  // 檢查陣列中的元素是否都是數字
  const allNumbers = vector.every(
    (item) => typeof item === "number" && !isNaN(item)
  );
  if (!allNumbers) {
    console.error("向量嵌入包含非數字元素");
    throw new Error("向量嵌入必須只包含數字");
  }

  console.log(`調整向量維度：從 ${vector.length} 到 ${targetDimension}`);

  if (vector.length === targetDimension) return vector;

  if (vector.length > targetDimension) {
    // 縮減維度：取前 targetDimension 個元素
    return vector.slice(0, targetDimension);
  } else {
    // 增加維度：用 0 填充 (不太可能發生在這個案例中)
    return [...vector, ...Array(targetDimension - vector.length).fill(0)];
  }
}

// 添加一個測試上傳函數，使用固定向量
const testUploadWithStaticVector = async (faq) => {
  try {
    console.log("開始測試上傳，使用固定向量...");

    // 初始化 Pinecone
    console.log("正在初始化 Pinecone 客戶端...");
    const pineconeIndex = await initPinecone();
    console.log("Pinecone 客戶端初始化成功");

    if (!faq) {
      console.error("未提供 FAQ 資料");
      throw new Error("測試上傳需要提供 FAQ 資料");
    }

    // 創建一個固定的測試向量 (1024維)
    const staticVector = Array(1024).fill(0.1);
    console.log("已創建靜態測試向量，維度:", staticVector.length);

    // 創建穩定的 ID
    const faqId = `test_faq_${createStableId(faq.question)}`;
    console.log("FAQ ID:", faqId);

    // 準備 metadata
    const metadata = {
      question: faq.question || "",
      answer: faq.answer || "",
      category: faq.category || "測試類別",
      keywords: Array.isArray(faq.keywords) ? faq.keywords.join(", ") : "",
      intent: faq.intent || "測試意圖",
      urgency: faq.urgency || "中",
      audience: faq.audience || "測試用戶",
      actions: Array.isArray(faq.actions) ? faq.actions.join(", ") : "",
      related_questions: Array.isArray(faq.related_questions)
        ? faq.related_questions.join(", ")
        : "",
      contentDigest: "test_digest_123",
      test: true,
    };

    console.log("準備上傳向量...");

    try {
      // 上傳測試向量
      await pineconeIndex.upsert([
        {
          id: faqId,
          values: staticVector,
          metadata: metadata,
        },
      ]);
      console.log("測試向量上傳成功！");

      return {
        success: true,
        message: "測試向量上傳成功",
        faqId,
      };
    } catch (upsertError) {
      console.error("測試向量上傳失敗:", upsertError);
      throw upsertError;
    }
  } catch (error) {
    console.error("測試上傳失敗，詳細錯誤:");
    console.error("錯誤名稱:", error.name);
    console.error("錯誤消息:", error.message);
    console.error("錯誤堆棧:", error.stack);

    return {
      success: false,
      message: `測試上傳失敗: ${error.message}`,
      error,
    };
  }
};

// 公開方法
module.exports = {
  uploadFaqToPinecone, // 上傳到向量資料庫中
  uploadEnrichedFaqToPinecone, // 上傳到向量資料庫中
  queryFaq, // 查詢向量資料庫中
  enrichFaqData, // 豐富資料
  readFaqJson, // 讀取資料
  createStableId, // 創建穩定的 ID
  createContentDigest, // 創建內容摘要
  testUploadWithStaticVector, // 測試上傳
};
