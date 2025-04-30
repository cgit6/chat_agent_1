/**
 * 全局配置文件 - 集中管理環境變量和常量
 */
const dotenv = require("dotenv");
const path = require("path");

// 載入環境變量
dotenv.config({ path: path.resolve(__dirname, ".env") });

// 環境變量
const config = {
  // Facebook API 相關
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN,
  MONGODB_URL: process.env.MONGODB_URL,
  // AI LLM 相關
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  // 向量資料庫相關
  PINECONE_API_KEY: process.env.PINECONE_API_KEY,
  PINECONE_ENVIRONMENT: process.env.PINECONE_ENVIRONMENT,
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,

  // 服務器相關
  PORT: process.env.PORT || 8080,

  // 添加環境變量檢查
  isConfigValid: function () {
    const missing = [];

    if (!this.PAGE_ACCESS_TOKEN) missing.push("PAGE_ACCESS_TOKEN");
    if (!this.VERIFY_TOKEN) missing.push("VERIFY_TOKEN");
    if (!this.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");

    if (missing.length > 0) {
      console.error(`錯誤: 缺少以下必要的環境變量: ${missing.join(", ")}`);
      return false;
    }

    return true;
  },
};

// 啟動時立即檢查配置是否有效
console.log("環境變量檢查:");
console.log(`VERIFY_TOKEN: ${config.VERIFY_TOKEN ? "已設置" : "未設置"}`);
console.log(
  `PAGE_ACCESS_TOKEN: ${config.PAGE_ACCESS_TOKEN ? "已設置" : "未設置"}`
);
console.log(
  `PAGE_ACCESS_TOKEN 長度: ${
    config.PAGE_ACCESS_TOKEN ? config.PAGE_ACCESS_TOKEN.length : "N/A"
  }`
);

if (config.PAGE_ACCESS_TOKEN) {
  // 檢查 PAGE_ACCESS_TOKEN 是否被錯誤地跨多行存儲
  if (
    config.PAGE_ACCESS_TOKEN.includes("\n") ||
    config.PAGE_ACCESS_TOKEN.includes("\r")
  ) {
    console.error("警告: PAGE_ACCESS_TOKEN 包含換行符，可能導致無法正確使用");
  }

  // 檢查 PAGE_ACCESS_TOKEN 是否為完整令牌
  if (config.PAGE_ACCESS_TOKEN.length < 20) {
    console.error("警告: PAGE_ACCESS_TOKEN 似乎太短，可能不是完整的令牌");
  }
}

module.exports = config;
