/**
 * MongoDB 連接模塊
 */
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('../config');

// 獲取 MongoDB 連接字符串
const getMongoURI = () => {
  const mongoURI = config.MONGODB_URI;
  if (!mongoURI) {
    throw new Error('未設置 MONGODB_URI 環境變量');
  }
  return mongoURI;
};

// 連接到 MongoDB
const connectDB = async () => {
  try {
    const mongoURI = getMongoURI();
    await mongoose.connect(mongoURI);
    logger.logMessage('MongoDB 連接成功', 'system', 'database');
    console.log('MongoDB 連接成功');
  } catch (error) {
    logger.logMessage(`MongoDB 連接失敗: ${error.message}`, 'system', 'database_error');
    console.error('MongoDB 連接失敗:', error.message);
    // 如果是生產環境，連接失敗可能是致命錯誤
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

module.exports = {
  connectDB
}; 