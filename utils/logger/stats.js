/**
 * 日誌分析和統計工具
 */
const logger = require('./index');

/**
 * 獲取日誌中的消息類型分佈
 * @param {Array} logs - 日誌數據
 * @returns {Object} 消息類型分佈統計
 */
function getMessageTypeDistribution(logs) {
  const typeRegex = /\[類型:(.*?)\]/;
  const typeCounts = {};
  
  logs.forEach(log => {
    const match = log.match(typeRegex);
    if (match && match[1]) {
      const type = match[1];
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
  });
  
  return typeCounts;
}

/**
 * 獲取活躍使用者統計
 * @param {Array} logs - 日誌數據
 * @returns {Object} 使用者活躍度統計
 */
function getActiveUsers(logs) {
  const psidRegex = /\[PSID:(.*?)\]/;
  const userActivity = {};
  
  logs.forEach(log => {
    const match = log.match(psidRegex);
    if (match && match[1]) {
      const psid = match[1];
      userActivity[psid] = (userActivity[psid] || 0) + 1;
    }
  });
  
  // 按消息數量排序的使用者 ID
  const sortedUsers = Object.keys(userActivity)
    .map(psid => ({ psid, count: userActivity[psid] }))
    .sort((a, b) => b.count - a.count);
  
  return {
    uniqueUsers: Object.keys(userActivity).length,
    userCounts: userActivity,
    mostActiveUsers: sortedUsers.slice(0, 10) // 前10名最活躍使用者
  };
}

/**
 * 獲取時間段活躍度分析
 * @param {Array} logs - 日誌數據
 * @returns {Object} 時間段活躍度統計
 */
function getTimeDistribution(logs) {
  const timeRegex = /\[(.*?)T(.*?)\./; // 匹配ISO時間格式
  const hourCounts = Array(24).fill(0);
  
  logs.forEach(log => {
    const match = log.match(timeRegex);
    if (match && match[2]) {
      const timePart = match[2];
      const hour = parseInt(timePart.split(':')[0]);
      if (!isNaN(hour) && hour >= 0 && hour < 24) {
        hourCounts[hour]++;
      }
    }
  });
  
  return {
    hourly: hourCounts,
    peakHour: hourCounts.indexOf(Math.max(...hourCounts))
  };
}

/**
 * 獲取完整的日誌統計信息
 * @param {Object} options - 統計選項
 * @returns {Promise<Object>} 統計結果
 */
async function getLogStats(options = {}) {
  try {
    // 獲取日誌數據
    const logs = await logger.readLogs(options);
    
    if (logs.length === 0) {
      return {
        success: false,
        message: "沒有找到日誌數據",
        count: 0
      };
    }
    
    // 生成統計信息
    const stats = {
      success: true,
      count: logs.length,
      messageTypes: getMessageTypeDistribution(logs),
      users: getActiveUsers(logs),
      timeDistribution: getTimeDistribution(logs),
      logInfo: logger.getLogInfo()
    };
    
    return stats;
  } catch (error) {
    console.error("生成日誌統計失敗:", error);
    return {
      success: false,
      message: "生成日誌統計失敗",
      error: error.message
    };
  }
}

module.exports = {
  getLogStats,
  getMessageTypeDistribution,
  getActiveUsers,
  getTimeDistribution
}; 