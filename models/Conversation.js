/**
 * Conversation模型 - 存儲用戶與機器人的對話
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// 對話模型
const ConversationSchema = new Schema(
  {
    // 基本對話內容
    userId: {
      type: String,
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },

    // 按照 customer_service_faq_enriched.json 結構的欄位
    category: {
      type: String,
      default: "未分類",
    },
    keywords: {
      type: [String],
      default: [],
    },
    intent: {
      type: String,
      default: "未知",
    },
    urgency: {
      type: String,
      enum: ["高", "中", "低"],
      default: "中",
    },
    audience: {
      type: String,
      default: "所有客戶",
    },
    actions: {
      type: [String],
      default: [],
    },
    related_questions: {
      type: [String],
      default: [],
    },

    // 向量存儲相關
    vectorId: {
      type: String,
      sparse: true,
    },
    contentDigest: {
      type: String,
      sparse: true,
    },

    // 是否已上傳到向量存儲
    isVectorized: {
      type: Boolean,
      default: false,
    },

    // 創建和更新時間
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

// 索引設置
ConversationSchema.index({ category: 1 });
ConversationSchema.index({ keywords: 1 });
ConversationSchema.index({ intent: 1 });
ConversationSchema.index({ createdAt: -1 });
ConversationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Conversation", ConversationSchema);
