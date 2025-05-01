/**
 * LevelOneQuestion模型 - 存儲基礎客服問答
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// 一級問答模型
const RuleSchema = new Schema(
  {
    // 分類名稱
    label: {
      type: String,
      required: true,
      index: true,
    },
    // 規則
    description: {
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
RuleSchema.index({ question: "text" }); // 為問題建立全文索引
RuleSchema.index({ createdAt: -1 }); // 為創建時間建立降序索引

// 中間件：更新時自動更新 updatedAt 字段
RuleSchema.pre("findOneAndUpdate", function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model("Rule", RuleSchema);
