/**
 * User模型 - 存儲LINE用戶信息
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    profile: {
      displayName: String,
      pictureUrl: String,
      statusMessage: String,
      language: String
    },
    stats: {
      messageCount: {
        type: Number,
        default: 0
      },
      lastInteractionAt: Date
    },
    settings: {
      language: {
        type: String,
        default: 'zh-TW'
      },
      notifications: {
        type: Boolean,
        default: true
      }
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    },
    tags: [String],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// 索引設置
UserSchema.index({ 'profile.displayName': 'text' });
UserSchema.index({ lastSeen: -1 });
UserSchema.index({ createdAt: -1 });

// 中間件：更新用戶時自動更新updatedAt字段
UserSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

// 中間件：保存用戶時檢查必填字段
UserSchema.pre('save', function (next) {
  if (!this.userId) {
    return next(new Error('用戶ID是必須的'));
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
        'stats.lastInteractionAt': now,
        $inc: { 'stats.messageCount': 1 }
      },
      { new: true }
    );
  } catch (error) {
    console.error('記錄用戶互動失敗:', error);
    return null;
  }
};

module.exports = mongoose.model('User', UserSchema); 