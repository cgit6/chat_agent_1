/**
 * 日誌相關路由
 */
const express = require('express');
const router = express.Router();
const logController = require('../controller/log.controller');

/**
 * @route   GET /
 * @desc    獲取日誌列表
 * @access  Public
 */
router.get('/', logController.getLogs);

/**
 * @route   GET /files
 * @desc    獲取日誌文件列表
 * @access  Public
 */
router.get('/files', logController.getLogFiles);

/**
 * @route   GET /stats
 * @desc    獲取日誌統計信息
 * @access  Public
 */
router.get('/stats', logController.getLogStats);

/**
 * @route   GET /file/:date
 * @desc    獲取指定日期的日誌內容
 * @access  Public
 */
router.get('/file/:date', logController.getLogByDate);

module.exports = router; 