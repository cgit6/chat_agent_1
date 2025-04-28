const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const logger = require("./utils/logger"); // 引入自定義日誌模塊
const config = require("./config"); // 引入配置模塊
const routes = require("./routes"); // 引入 API 路由
const { connectDB } = require("./models/db"); // 引入資料庫連接模塊

// 連接到 MongoDB 資料庫
connectDB()
  .then(() => {
    console.log("MongoDB 資料庫連接初始化完成");
  })
  .catch((err) => {
    console.error("資料庫連接失敗:", err.message);
  });

// 環境變量檢查結果
const configValid = config.isConfigValid();
if (!configValid) {
  console.error("由於環境變量缺失，應用程序可能無法正常運行。");
}

const app = express();
app.use(bodyParser.json());

app.use("/api/log", routes.apiRoutes); // 使用 API 路由
app.use("/v1/facebook_bot", routes.webhookRoutes); // 使用 facebook Webhook 路由 (掛載到根路徑)

// 根路徑的健康檢查端點
app.get("/", (req, res) => {
  res
    .status(200)
    .send(
      "Facebook Messenger Bot is running! 環境變量檢查: " +
        `VERIFY_TOKEN: ${config.VERIFY_TOKEN ? "已設置" : "未設置"}, ` +
        `PAGE_ACCESS_TOKEN: ${config.PAGE_ACCESS_TOKEN ? "已設置" : "未設置"}`
    );
});

const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`訪問 http://localhost:${PORT} 查看服務狀態`);
  console.log(`訪問 http://localhost:${PORT}/api/log 查看記錄的訊息日誌`);
  console.log(`訪問 http://localhost:${PORT}/api/log/stats 查看訊息統計信息`);

  // 記錄服務啟動信息
  logger.logMessage(`服務已啟動，監聽端口 ${PORT}`, "SYSTEM", "startup");
});
