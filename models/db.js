/**
 * MongoDB 連接模塊
 */
const mongoose = require("mongoose");
const logger = require("../utils/logger");
const config = require("../config");

// 獲取 MongoDB 連接字符串
const getMongoURL = () => {
  const mongoURL = config.MONGODB_URL;
  if (!mongoURL) {
    throw new Error("未設置 MONGODB_URL 環境變量");
  }
  return mongoURL;
};

// 連接到 MongoDB
const connectDB = async () => {
  try {
    const mongoURL = getMongoURL(); // 獲取 MongoDB 連接字符串
    console.log("MongoDB 連接字符串:", mongoURL);
    await mongoose.connect(mongoURL);
    logger.logMessage("MongoDB 連接成功", "system", "database");
    console.log("MongoDB 連接成功");
  } catch (error) {
    logger.logMessage(
      `MongoDB 連接失敗: ${error.message}`,
      "system",
      "database_error"
    );
    console.error("MongoDB 連接失敗:", error.message);
    // 如果是生產環境，連接失敗可能是致命錯誤
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
};

module.exports = {
  connectDB,
};
