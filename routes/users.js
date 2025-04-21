/**
 * 用戶路由 - 提供用戶相關API接口
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const { getUserStats } = require('../services/userService');
const logger = require('../utils/logger');

/**
 * 獲取用戶列表
 * 支持分頁、搜索和排序
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 50, skip = 0, sort = '-lastSeen', search } = req.query;
    
    let query = {};
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      if (mongoose.Types.ObjectId.isValid(search)) {
        query.$or = [
          { userId: search },
          { 'profile.displayName': searchRegex }
        ];
      } else {
        query.$or = [
          { 'profile.displayName': searchRegex }
        ];
      }
    }
    
    const users = await User.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .skip(parseInt(skip));
      
    const total = await User.countDocuments(query);
    
    if (users.length === 0) {
      return res.status(404).json({ 
        message: '未找到用戶記錄',
        data: []
      });
    }
    
    return res.status(200).json({
      message: '獲取用戶列表成功',
      data: users,
      meta: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > (parseInt(skip) + parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('獲取用戶列表失敗', { error: error.message });
    return res.status(500).json({
      message: '獲取用戶列表失敗',
      error: error.message
    });
  }
});

/**
 * 獲取用戶統計信息
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getUserStats();
    
    return res.status(200).json({
      message: '獲取用戶統計信息成功',
      data: stats
    });
  } catch (error) {
    logger.error('獲取用戶統計信息失敗', { error: error.message });
    return res.status(500).json({
      message: '獲取用戶統計信息失敗',
      error: error.message
    });
  }
});

/**
 * 獲取特定用戶信息
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findOne({ userId });
    
    if (!user) {
      return res.status(404).json({
        message: '未找到該用戶',
        data: null
      });
    }
    
    return res.status(200).json({
      message: '獲取用戶信息成功',
      data: user
    });
  } catch (error) {
    logger.error('獲取用戶信息失敗', { userId: req.params.userId, error: error.message });
    return res.status(500).json({
      message: '獲取用戶信息失敗',
      error: error.message
    });
  }
});

module.exports = router; 