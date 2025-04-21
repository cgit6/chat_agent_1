/**
 * 路由集中管理
 */
const express = require('express');
const router = express.Router();

// 導入所有路由模塊
const logsRoutes = require('./logs');
const webhookRoutes = require('./webhook');

// 掛載日誌路由到 /
router.use('/', logsRoutes);

// 將 webhook 相關路由導出，不掛載到此路由器
// 這些路由將在 server.js 中直接掛載到根路徑

// 將來可以在這裡添加更多的路由

module.exports = {
  apiRoutes: router,
  webhookRoutes: webhookRoutes
}; 