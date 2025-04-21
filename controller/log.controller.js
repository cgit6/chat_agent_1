/**
 * 日誌控制器 - 處理日誌相關操作
 */
const logger = require('../utils/logger');
const logStats = require('../utils/logger/stats');

/**
 * 獲取日誌列表
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */
exports.getLogs = async (req, res) => {
  try {
    // 讀取查詢參數
    const limit = parseInt(req.query.limit) || 1000;
    const search = req.query.search || null;
    
    let logLines = [];
    
    // 如果有搜索參數，使用搜索功能
    if (search) {
      logLines = await logger.searchLogs(search, { limit });
    } else {
      // 使用日誌模塊讀取日誌
      logLines = await logger.readLogs({ limit });
    }
    
    const logInfo = logger.getLogInfo();
    
    if (logLines.length === 0) {
      return res.status(404).json({
        success: false,
        message: "尚無日誌記錄",
        info: logInfo
      });
    }
    
    res.status(200).json({
      success: true,
      total: logLines.length,
      logs: logLines,
      info: logInfo
    });
  } catch (error) {
    console.error("讀取日誌失敗:", error);
    res.status(500).json({
      success: false,
      message: "讀取日誌失敗",
      error: error.message
    });
  }
};

/**
 * 獲取日誌文件列表
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */
exports.getLogFiles = async (req, res) => {
  try {
    const files = await logger.getLogFiles();
    
    res.status(200).json({
      success: true,
      total: files.length,
      files
    });
  } catch (error) {
    console.error("獲取日誌文件列表失敗:", error);
    res.status(500).json({
      success: false,
      message: "獲取日誌文件列表失敗",
      error: error.message
    });
  }
};

/**
 * 獲取日誌統計信息
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */
exports.getLogStats = async (req, res) => {
  try {
    // 讀取查詢參數
    const limit = parseInt(req.query.limit) || 1000;
    
    // 獲取日誌統計
    const stats = await logStats.getLogStats({ limit });
    
    res.status(200).json(stats);
  } catch (error) {
    console.error("獲取日誌統計失敗:", error);
    res.status(500).json({
      success: false,
      message: "獲取日誌統計失敗",
      error: error.message
    });
  }
};

/**
 * 獲取指定日期的日誌內容
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */
exports.getLogByDate = async (req, res) => {
  try {
    const date = req.params.date;
    const config = logger.getLogInfo().config;
    
    // 構建指定日期的日誌文件路徑
    const filePath = require('path').join(
      config.baseDir,
      `${config.filePrefix}${date}.log`
    );
    
    // 讀取查詢參數
    const limit = parseInt(req.query.limit) || 1000;
    const search = req.query.search || null;
    
    // 檢查文件是否存在
    if (!require('fs').existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: `找不到 ${date} 的日誌文件`
      });
    }
    
    let logLines = [];
    
    // 如果有搜索參數，使用搜索功能
    if (search) {
      logLines = await logger.searchLogs(search, { file: filePath, limit });
    } else {
      // 使用日誌模塊讀取指定日期的日誌
      logLines = await logger.readLogs({ file: filePath, limit });
    }
    
    res.status(200).json({
      success: true,
      date,
      total: logLines.length,
      logs: logLines
    });
  } catch (error) {
    console.error("讀取指定日期日誌失敗:", error);
    res.status(500).json({
      success: false,
      message: "讀取指定日期日誌失敗",
      error: error.message
    });
  }
}; 