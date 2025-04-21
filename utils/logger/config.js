/**
 * 日誌系統配置文件
 */
const path = require("path");

module.exports = {
  // 基本配置
  baseDir: path.join(process.cwd(), "logs"), // 日誌目錄
  filePrefix: "messages_", // 日誌文件前綴
  
  // 日期格式化函數，用於生成日誌文件名
  dateFormat: () => new Date().toISOString().split('T')[0],
  
  // 日誌旋轉設置
  rotation: {
    enabled: true, // 是否啟用日誌旋轉
    maxFiles: 30, // 保留的最大日誌文件數（按日期）
    checkInterval: 24 * 60 * 60 * 1000 // 檢查間隔（毫秒），默認1天
  },
  
  // 日誌格式設置
  format: {
    timestamp: true, // 是否包含時間戳
    psid: true, // 是否包含PSID
    type: true, // 是否包含類型
    contentOnly: false // 是否只記錄內容
  }
}; 