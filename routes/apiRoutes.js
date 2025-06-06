/**
 * API 路由設置
 */
const express = require("express");
const router = express.Router();

// 導入相關模塊
const { generateAIResponse } = require("../utils/aiResponseHandler");

// 處理對話請求
router.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "消息不能為空",
      });
    }

    const isNewUser = req.body.isNewUser || false;
    const useTestMode = req.body.useTestMode || false;

    // 使用 AI 處理消息
    const response = await generateAIResponse(userId || "anonymous", message, {
      isNewUser,
      useTestMode,
    });

    return res.json({
      success: true,
      message: response,
    });
  } catch (error) {
    console.error("處理對話請求失敗:", error);
    return res.status(500).json({
      success: false,
      message: "處理對話請求失敗",
      error: error.message,
    });
  }
});

// 添加一個測試路由來檢測 Pinecone 連接
router.get("/test-pinecone", async (req, res) => {
  try {
    const {
      testUploadWithStaticVector,
    } = require("../utils/vectorStoreHandler");

    // 創建一個簡單的測試 FAQ
    const testFaq = {
      question: "這是一個測試問題",
      answer: "這是一個測試回答",
      category: "測試類別",
      keywords: ["測試", "pinecone", "連接"],
      intent: "測試",
      urgency: "低",
      audience: "開發人員",
      actions: [],
      related_questions: [],
    };

    // 嘗試上傳測試向量
    const result = await testUploadWithStaticVector(testFaq);

    if (result.success) {
      return res.json({
        success: true,
        message: "Pinecone 連接和上傳測試成功",
        details: result,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Pinecone 上傳測試失敗",
        error: result.message,
        details: result,
      });
    }
  } catch (error) {
    console.error("Pinecone 測試失敗:", error);
    return res.status(500).json({
      success: false,
      message: "Pinecone 測試失敗",
      error: error.message,
    });
  }
});

// 添加一個測試對話向量化的 API 端點
router.post("/test-conversation-vector", async (req, res) => {
  try {
    const { userId, question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: "問題和回答不能為空",
      });
    }

    const {
      processAndStoreConversation,
    } = require("../utils/conversationHandler");

    // 使用同步方式處理，並啟用測試模式
    const result = await processAndStoreConversation(
      userId || "test-user",
      question,
      answer,
      {
        useTestMode: true,
        syncProcess: true,
      }
    );

    return res.json({
      success: true,
      message: "測試對話向量化完成",
      result,
    });
  } catch (error) {
    console.error("測試對話向量化失敗:", error);
    return res.status(500).json({
      success: false,
      message: "測試對話向量化失敗",
      error: error.message,
    });
  }
});

// 添加一個測試聊天功能的調試路由
router.get("/debug-chat", async (req, res) => {
  try {
    const testMessage = req.query.message || "你好";
    const useTestMode = req.query.test === "true";

    console.log(
      `測試聊天功能, 測試消息: "${testMessage}", 測試模式: ${
        useTestMode ? "開啟" : "關閉"
      }`
    );

    // 使用 AI 處理消息
    const response = await generateAIResponse("debug-user", testMessage, {
      isNewUser: false,
      useTestMode: useTestMode,
    });

    return res.json({
      success: true,
      message: response,
      testMode: useTestMode,
    });
  } catch (error) {
    console.error("調試聊天功能失敗:", error);
    return res.status(500).json({
      success: false,
      message: "調試聊天功能失敗",
      error: error.message,
      stack: error.stack,
    });
  }
});

// 導出路由器
module.exports = router;
