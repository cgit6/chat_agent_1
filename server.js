// 導入需要的模塊
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// 載入環境變數
dotenv.config();

// 初始化應用
const app = express();

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 環境變數中的端口，或默認為8080（Cloud Run推薦）
const PORT = process.env.PORT || 8080;

// 路由
app.get("/", (req, res) => {
  res.send("歡迎使用 Node.js 服務! 該服務已成功部署到 Google Cloud Run.");
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`服務器運行在端口 ${PORT}`);
  console.log("按下 CTRL+C 停止服務器");
});
