/**
 * Webhook 控制器 - 處理 Facebook Messenger webhook 相關請求
 */
const axios = require("axios");
const logger = require("../utils/logger");
const config = require("../config");
const aiResponseHandler = require("../utils/aiResponseHandler");

// 模塊層級初始化環境變量
const PAGE_ACCESS_TOKEN = config.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = config.VERIFY_TOKEN;

// 檢查環境變量（僅供診斷使用）
console.log("Webhook控制器環境變量檢查:");
console.log(`VERIFY_TOKEN: ${VERIFY_TOKEN ? "已設置" : "未設置"}`);
console.log(`PAGE_ACCESS_TOKEN: ${PAGE_ACCESS_TOKEN ? "已設置" : "未設置"}`);
console.log(`PAGE_ACCESS_TOKEN 長度: ${PAGE_ACCESS_TOKEN ? PAGE_ACCESS_TOKEN.length : "N/A"}`);

/**
 * 處理 webhook GET 請求 (用於驗證)
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */
exports.verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("收到webhook GET請求:");
  console.log(`mode: ${mode}`);
  console.log(`token: ${token}`);
  console.log(`challenge: ${challenge}`);
  console.log(`期望的token: ${VERIFY_TOKEN}`);

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook驗證成功");
      res.status(200).send(challenge);
    } else {
      console.log("Webhook驗證失敗: 無效的驗證令牌或模式");
      res.sendStatus(403);
    }
  } else {
    console.log("Webhook驗證失敗: 缺少mode或token參數");
    res.sendStatus(400);
  }
};

/**
 * 處理 webhook POST 請求
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */
exports.handleWebhook = async (req, res) => {
  const body = req.body;
  console.log("收到webhook POST請求, body:", JSON.stringify(body, null, 2));

  if (body.object === "page") {
    console.log("確認請求類型為頁面事件");
    
    // 檢查 entry 數組是否存在且不為空
    if (!body.entry || body.entry.length === 0) {
      console.log("錯誤: body.entry 不存在或為空");
      return res.sendStatus(400);
    }

    body.entry.forEach((entry) => {
      console.log("處理 entry:", JSON.stringify(entry, null, 2));
      
      // 檢查 messaging 數組是否存在且不為空
      if (!entry.messaging || entry.messaging.length === 0) {
        console.log("錯誤: entry.messaging 不存在或為空");
        return;
      }
      
      const webhook_event = entry.messaging[0];
      console.log("webhook_event:", JSON.stringify(webhook_event, null, 2));
      
      // 檢查 sender 是否存在
      if (!webhook_event.sender || !webhook_event.sender.id) {
        console.log("錯誤: webhook_event.sender 或 id 不存在");
        return;
      }
      
      const sender_psid = webhook_event.sender.id;
      console.log("發送者 PSID:", sender_psid);

      if (webhook_event.message) {
        console.log(`收到來自 ${sender_psid} 的訊息:`, JSON.stringify(webhook_event.message, null, 2));
        
        // 添加醒目的用戶訊息打印
        if (webhook_event.message.text) {
          const divider = "=".repeat(50);
          console.log("\n" + divider);
          console.log("📩 用戶訊息:");
          console.log("🔹 PSID:", sender_psid);
          console.log("🔹 時間:", new Date().toLocaleString());
          console.log("🔹 內容:", webhook_event.message.text);
          console.log(divider + "\n");
          
          // 使用日誌模塊記錄文本訊息
          logger.logMessage(`用戶發送訊息: ${webhook_event.message.text}`, sender_psid, "text");
        } else if (webhook_event.message.attachments) {
          const attachmentType = webhook_event.message.attachments[0]?.type || '未知';
          
          const divider = "*".repeat(50);
          console.log("\n" + divider);
          console.log("📩 用戶發送了非文本內容:");
          console.log("🔹 PSID:", sender_psid);
          console.log("🔹 類型:", attachmentType);
          console.log(divider + "\n");
          
          // 使用日誌模塊記錄非文本訊息
          logger.logMessage(`用戶發送了 ${attachmentType} 類型的附件`, sender_psid, attachmentType);
        }
        
        handleMessage(sender_psid, webhook_event.message);
      } else {
        console.log("未收到訊息內容，可能是其他類型的事件");
      }
    });

    res.status(200).send("EVENT_RECEIVED");
  } else {
    console.log(`收到非page對象的請求，實際為: ${body.object}`);
    res.sendStatus(404);
  }
};

/**
 * 處理用戶發送的訊息
 * @param {string} sender_psid - 發送者的 PSID
 * @param {object} received_message - 收到的訊息對象
 */
async function handleMessage(sender_psid, received_message) {
  console.log("開始處理訊息");
  
  // 檢查訊息是否包含文本
  if (!received_message.text) {
    console.log("訊息不包含文本，可能是貼圖、附件或其他內容");
    
    // 如果是貼圖、附件等，可以返回默認回應
    const response = {
      text: "我收到了您的訊息，但目前只能回應文字內容。"
    };
    
    await sendResponse(sender_psid, response);
    return;
  }
  
  try {
    // 使用 AI 處理用戶消息
    console.log("正在使用 AI 處理用戶消息...");
    const aiResponse = await aiResponseHandler.generateAIResponse(
      sender_psid, 
      received_message.text
    );
    
    console.log(`AI 生成的回應: ${aiResponse}`);
    
    const response = {
      text: aiResponse
    };
    
    console.log(`準備回覆給 ${sender_psid}:`, JSON.stringify(response, null, 2));
    await sendResponse(sender_psid, response);
  } catch (error) {
    console.error("AI 處理消息失敗:", error);
    
    // 失敗時使用默認回應
    const fallbackResponse = {
      text: `很抱歉，我暫時無法處理您的請求。請稍後再試。`
    };
    
    console.log(`發送默認回應給 ${sender_psid}`);
    await sendResponse(sender_psid, fallbackResponse);
  }
}

/**
 * 發送回應給用戶
 * @param {string} sender_psid - 發送者的 PSID
 * @param {object} response - 回應內容
 * @returns {boolean} - 是否發送成功
 */
async function sendResponse(sender_psid, response) {
  try {
    // 診斷信息
    console.log(`發送訊息前的 PAGE_ACCESS_TOKEN 狀態: ${PAGE_ACCESS_TOKEN ? "已設置，長度為" + PAGE_ACCESS_TOKEN.length : "未設置"}`);
    
    console.log("發送請求到 Facebook API...");
    const apiUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    console.log("API URL:", apiUrl);
    
    const requestBody = {
      recipient: { id: sender_psid },
      message: response
    };
    console.log("請求內容:", JSON.stringify(requestBody, null, 2));
    
    const result = await axios.post(apiUrl, requestBody);
    
    console.log("訊息發送成功, 回應:", JSON.stringify(result.data, null, 2));
    
    // 記錄機器人回覆
    logger.logMessage(`機器人回覆: ${JSON.stringify(response)}`, sender_psid, "bot_response");
    
    return true;
  } catch (error) {
    console.error("訊息發送失敗:");
    
    if (error.response) {
      // 詳細輸出 API 錯誤信息
      console.error("錯誤狀態碼:", error.response.status);
      console.error("錯誤數據:", JSON.stringify(error.response.data, null, 2));
      
      // 處理常見的 Facebook API 錯誤
      if (error.response.data && error.response.data.error) {
        const fbError = error.response.data.error;
        console.error(`Facebook API 錯誤: ${fbError.message}, 代碼: ${fbError.code}, 類型: ${fbError.type}`);
        
        if (fbError.code === 190) {
          console.error("PAGE_ACCESS_TOKEN 可能已過期或無效，請重新獲取");
        } else if (fbError.code === 10) {
          console.error("權限不足，請確保您的應用擁有必要的權限");
        }
      }
    } else if (error.request) {
      console.error("未收到回應，可能是網絡問題:", error.request);
    } else {
      console.error("請求錯誤:", error.message);
    }
    
    // 記錄錯誤
    logger.logMessage(`發送訊息失敗: ${error.message}`, sender_psid, "error");
    
    return false;
  }
}

/**
 * 測試 Facebook API 連接
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */
exports.testFacebookConnection = async (req, res) => {
  try {
    console.log("測試 Facebook API 連接...");
    console.log(`PAGE_ACCESS_TOKEN 狀態: ${PAGE_ACCESS_TOKEN ? "已設置，長度為" + PAGE_ACCESS_TOKEN.length : "未設置"}`);
    
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/me?access_token=${PAGE_ACCESS_TOKEN}`
    );
    
    console.log("Facebook API 連接成功:", JSON.stringify(response.data, null, 2));
    res.status(200).json({ 
      success: true, 
      message: "Facebook API 連接成功", 
      data: response.data 
    });
  } catch (error) {
    console.error("Facebook API 連接失敗:");
    
    let errorData = {
      message: "連接失敗",
      error: error.message
    };
    
    if (error.response) {
      errorData.status = error.response.status;
      errorData.data = error.response.data;
    }
    
    console.error(JSON.stringify(errorData, null, 2));
    res.status(500).json({ 
      success: false, 
      message: "Facebook API 連接失敗", 
      error: errorData 
    });
  }
}; 