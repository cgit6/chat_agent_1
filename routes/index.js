/**
 * 路由集中管理
 */
const express = require("express");
const logRouter = express.Router();

// 導入所有路由模塊
const logsRoutes = require("./logs");
const webhookRoutes = require("./facebook.webhook"); // 引入 Facebook Webhook 路由
const apiRoutes = require("./apiRoutes"); // 引入我們的 API 路由

// 掛載日誌路由到 /
logRouter.use("/", logsRoutes);

// 將 webhook 相關路由導出，不掛載到此路由器
// 這些路由將在 server.js 中直接掛載到根路徑

// 將來可以在這裡添加更多的路由

module.exports = {
  apiRoutes: apiRoutes, // 直接導出 API 路由
  logRoutes: logRouter, // 導出日誌路由
  webhookRoutes,
};
