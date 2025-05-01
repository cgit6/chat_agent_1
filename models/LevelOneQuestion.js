/**
 * LevelOneQuestion模型 - 存儲基礎客服問答
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// 一級問答模型
const LevelOneQuestionSchema = new Schema(
  {
    // 基本問答內容
    question: {
      type: String,
      required: true,
      index: true,
    },
    answer: {
      type: String,
      required: true,
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
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// 索引設置
LevelOneQuestionSchema.index({ question: "text" }); // 為問題建立全文索引
LevelOneQuestionSchema.index({ createdAt: -1 }); // 為創建時間建立降序索引

// 中間件：更新時自動更新 updatedAt 字段
LevelOneQuestionSchema.pre("findOneAndUpdate", function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model("LevelOneQuestion", LevelOneQuestionSchema);
