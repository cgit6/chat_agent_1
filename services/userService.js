/**
 * 用戶服務 - 處理用戶相關業務邏輯
 */
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * 檢查用戶是否存在，不存在則創建新用戶
 * @param {string} userId - LINE 用戶 ID
 * @param {Object} profile - 用戶簡介信息
 * @returns {Promise<Object>} - 返回用戶對象和是否為新用戶的標識
 */
async function processUser(userId, profile = {}) {
  try {
    if (!userId) {
      throw new Error('無效的用戶ID');
    }
    
    const { user, isNewUser } = await User.findOrCreate(userId, profile);
    
    return { user, isNewUser };
  } catch (error) {
    logger.error(`處理用戶信息時出錯: ${error.message}`, { userId, error });
    // 即使數據庫操作失敗，我們仍然希望能繼續處理用戶請求
    return { user: null, isNewUser: false, error };
  }
}

/**
 * 獲取用戶統計信息
 * @returns {Promise<Object>} - 返回用戶統計信息
 */
async function getUserStats() {
  try {
    const totalCount = await User.countDocuments();
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
    });
    const activeUsersToday = await User.countDocuments({
      lastSeen: { $gte: new Date().setHours(0, 0, 0, 0) }
    });
    
    return {
      totalCount,
      newUsersToday,
      activeUsersToday
    };
  } catch (error) {
    logger.error(`獲取用戶統計信息時出錯: ${error.message}`, { error });
    return {
      totalCount: 0,
      newUsersToday: 0,
      activeUsersToday: 0,
      error: error.message
    };
  }
}

module.exports = {
  processUser,
  getUserStats
}; 