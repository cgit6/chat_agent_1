/**
 * Webhook 相關路由
 */
const express = require("express");
const router = express.Router();
const webhookController = require("../controller/facebook.webhook.controller");

/**
 * @route   GET /webhook
 * @desc    處理 Facebook Webhook 驗證請求
 * @access  Public
 */
router.get("/webhook", webhookController.verifyWebhook);

/**
 * @route   POST /webhook
 * @desc    處理來自 Facebook 的 Webhook 事件
 * @access  Public
 */
router.post("/webhook", webhookController.handleWebhook);

/**
 * @route   GET /test-facebook
 * @desc    測試 Facebook API 連接
 * @access  Public
 */
router.get("/test-facebook", webhookController.testFacebookConnection);

module.exports = router;
