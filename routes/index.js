// index.js
const express = require("express");

// 導入所有路由模塊
const logsRoutes = require("./logs");
const webhookRoutes = require("./facebook.webhook"); // 引入 Facebook Webhook 路由
const apiRoutes = require("./apiRoutes"); // 引入我們的 API 路由

// 將來可以在這裡添加更多的路由

module.exports = {
  apiRoutes: apiRoutes, // 直接導出 API 路由
  logRoutes: logsRoutes, // 導出日誌路由
  webhookRoutes: webhookRoutes, // 直接導出 Facebook Webhook 路由
};
