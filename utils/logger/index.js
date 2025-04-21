const fs = require("fs");
const path = require("path");
const config = require("./config");

/**
 * 初始化日誌系統
 * @returns {Object} 日誌相關功能和屬性
 */
function initLogger() {
  // 確保日誌目錄存在
  if (!fs.existsSync(config.baseDir)) {
    fs.mkdirSync(config.baseDir, { recursive: true });
    console.log(`創建日誌目錄: ${config.baseDir}`);
  }

  // 生成今天的日誌文件路徑
  const getLogFilePath = () => {
    return path.join(
      config.baseDir, 
      `${config.filePrefix}${config.dateFormat()}.log`
    );
  };

  let currentLogFile = getLogFilePath();

  // 檢查是否需要旋轉日誌
  if (config.rotation.enabled) {
    // 立即清理舊日誌
    cleanupOldLogs();
    
    // 設置定時器定期檢查日誌旋轉
    setInterval(() => {
      const newLogFile = getLogFilePath();
      // 檢查是否是新的一天或日誌文件是否改變
      if (newLogFile !== currentLogFile) {
        currentLogFile = newLogFile;
        console.log(`日誌文件已旋轉到: ${currentLogFile}`);
      }
      
      // 清理舊日誌文件
      cleanupOldLogs();
    }, config.rotation.checkInterval);
  }

  /**
   * 清理舊的日誌文件
   */
  function cleanupOldLogs() {
    try {
      const files = fs.readdirSync(config.baseDir);
      const logFiles = files
        .filter(file => file.startsWith(config.filePrefix) && file.endsWith('.log'))
        .map(file => {
          return {
            name: file,
            path: path.join(config.baseDir, file),
            date: file.replace(config.filePrefix, '').replace('.log', '')
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date)); // 按日期降序排列
      
      // 如果超過最大文件數，刪除最舊的
      if (logFiles.length > config.rotation.maxFiles) {
        const filesToDelete = logFiles.slice(config.rotation.maxFiles);
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
            console.log(`已刪除舊日誌文件: ${file.name}`);
          } catch (err) {
            console.error(`刪除日誌文件 ${file.name} 失敗:`, err);
          }
        });
      }
    } catch (err) {
      console.error('清理舊日誌文件失敗:', err);
    }
  }

  /**
   * 格式化日誌條目
   * @param {string} message - 日誌消息
   * @param {string} psid - 用戶PSID
   * @param {string} type - 消息類型
   * @returns {string} 格式化的日誌條目
   */
  function formatLogEntry(message, psid, type) {
    const parts = [];
    
    if (config.format.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    if (config.format.psid) {
      parts.push(`[PSID:${psid}]`);
    }
    
    if (config.format.type) {
      parts.push(`[類型:${type}]`);
    }
    
    if (config.format.contentOnly) {
      return `${message}\n`;
    }
    
    return `${parts.join(' ')} ${message}\n`;
  }

  /**
   * 記錄訊息到日誌文件
   * @param {string} message - 要記錄的訊息
   * @param {string} psid - 發送者 ID
   * @param {string} type - 訊息類型
   */
  function logMessage(message, psid, type = "text") {
    // 確保當前日誌文件是最新的
    currentLogFile = getLogFilePath();
    
    const logEntry = formatLogEntry(message, psid, type);
    
    fs.appendFile(currentLogFile, logEntry, (err) => {
      if (err) {
        console.error("寫入日誌失敗:", err);
      }
    });
  }

  /**
   * 讀取當前日誌文件內容
   * @param {Object} options - 讀取選項
   * @returns {Promise<Array>} 解析後的日誌行數組
   */
  async function readLogs(options = {}) {
    return new Promise((resolve, reject) => {
      // 預設選項
      const defaultOptions = {
        file: currentLogFile, // 默認讀取當前日誌文件
        limit: 1000,          // 最多返回行數
        filter: null,         // 過濾條件
        reverse: true         // 是否按時間倒序（最新的先）
      };
      
      const opts = { ...defaultOptions, ...options };
      
      if (!fs.existsSync(opts.file)) {
        return resolve([]);
      }
      
      fs.readFile(opts.file, 'utf8', (err, data) => {
        if (err) {
          console.error("讀取日誌文件失敗:", err);
          return reject(err);
        }
        
        let logLines = data.split('\n')
          .filter(line => line.trim())
          .map(line => line.trim());
        
        // 應用過濾器
        if (opts.filter) {
          logLines = logLines.filter(opts.filter);
        }
        
        // 應用排序
        if (opts.reverse) {
          logLines.reverse();
        }
        
        // 應用限制
        if (opts.limit > 0 && logLines.length > opts.limit) {
          logLines = logLines.slice(0, opts.limit);
        }
        
        resolve(logLines);
      });
    });
  }

  /**
   * 獲取日誌文件列表
   * @returns {Promise<Array>} 日誌文件列表
   */
  async function getLogFiles() {
    return new Promise((resolve, reject) => {
      fs.readdir(config.baseDir, (err, files) => {
        if (err) {
          console.error("讀取日誌目錄失敗:", err);
          return reject(err);
        }
        
        const logFiles = files
          .filter(file => file.startsWith(config.filePrefix) && file.endsWith('.log'))
          .map(file => {
            const filePath = path.join(config.baseDir, file);
            let stats = { size: 0, mtime: new Date(0) };
            
            try {
              stats = fs.statSync(filePath);
            } catch (e) {
              console.error(`獲取文件 ${file} 狀態失敗:`, e);
            }
            
            return {
              name: file,
              path: filePath,
              date: file.replace(config.filePrefix, '').replace('.log', ''),
              size: stats.size,
              modified: stats.mtime
            };
          })
          .sort((a, b) => b.date.localeCompare(a.date)); // 按日期降序排列
        
        resolve(logFiles);
      });
    });
  }

  /**
   * 獲取日誌系統相關信息
   * @returns {Object} 日誌系統信息
   */
  function getLogInfo() {
    return {
      currentLogFile,
      config,
      baseDir: config.baseDir,
      exists: fs.existsSync(currentLogFile),
      today: config.dateFormat()
    };
  }

  /**
   * 搜索日誌
   * @param {string} searchTerm - 搜索詞
   * @param {Object} options - 搜索選項
   * @returns {Promise<Array>} 搜索結果
   */
  async function searchLogs(searchTerm, options = {}) {
    // 預設選項
    const defaultOptions = {
      file: currentLogFile,   // 默認搜索當前日誌文件
      caseSensitive: false,   // 是否區分大小寫
      limit: 100              // 最大結果數
    };
    
    const opts = { ...defaultOptions, ...options };
    
    // 如果沒有指定搜索詞，返回空結果
    if (!searchTerm) {
      return [];
    }
    
    const filter = (line) => {
      if (opts.caseSensitive) {
        return line.includes(searchTerm);
      } else {
        return line.toLowerCase().includes(searchTerm.toLowerCase());
      }
    };
    
    return readLogs({
      file: opts.file,
      limit: opts.limit,
      filter: filter
    });
  }

  // 返回日誌功能接口
  return {
    logMessage,
    readLogs,
    getLogInfo,
    getLogFiles,
    searchLogs
  };
}

// 創建並導出日誌記錄器實例
const logger = initLogger();
module.exports = logger; 