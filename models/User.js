/**
 * User模型 - 存儲LINE用戶信息
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// 用戶模型(userId、profile、stats、settings、lastSeen、isActive、tags、createdAt、updatedAt)
const UserSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // 用戶的個人資料
    profile: {
      displayName: {
        type: String,
        default: "未知用戶",
      },
      // 你可以之後再加更多個人資訊，比如 avatar, bio 等
    },

    // 用戶的統計信息
    stats: {
      messageCount: {
        type: Number,
        default: 0,
      },
      lastInteractionAt: Date,
    },

    // 用戶的設定
    settings: {
      language: {
        type: String,
        default: "zh-TW",
      },
      gender: String,
    },
    // 用戶的最後互動時間
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    // 這個客人的等級
    tags: [String],

    // 創建時間
    createdAt: {
      type: Date,
      default: Date.now,
    },
    // 更新時間
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
UserSchema.index({ "profile.displayName": "text" }); // 為 profile.displayName 字段建立全文索引
UserSchema.index({ lastSeen: -1 }); // 為 lastSeen 字段建立降序索引
UserSchema.index({ createdAt: -1 }); // 為 createdAt 字段建立降序索引

// 中間件：更新用戶時自動更新updatedAt字段
UserSchema.pre("findOneAndUpdate", function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

// 中間件：保存用戶時檢查必填字段
UserSchema.pre("save", function (next) {
  if (!this.userId) {
    return next(new Error("用戶ID是必須的"));
  }
  next();
});

// 靜態方法：更新用戶的最後互動時間和消息計數
UserSchema.statics.recordInteraction = async function (userId) {
  try {
    const now = new Date();
    return await this.findOneAndUpdate(
      { userId },
      {
        lastSeen: now,
        "stats.lastInteractionAt": now,
        $inc: { "stats.messageCount": 1 },
      },
      { new: true }
    );
  } catch (error) {
    console.error("記錄用戶互動失敗:", error);
    return null;
  }
};

module.exports = mongoose.model("User", UserSchema);
