/**
 * Webhook 控制器 - 處理 Facebook Messenger webhook 相關請求
 */
const axios = require("axios");
const logger = require("../utils/logger");
const config = require("../config");
const aiResponseHandler = require("../utils/aiResponseHandler");

const User = require("../models/User"); // 使用者 schema

// 模塊層級初始化環境變量
const PAGE_ACCESS_TOKEN = config.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = config.VERIFY_TOKEN;

// 檢查環境變量（僅供診斷使用）
// console.log("Webhook控制器環境變量檢查:");
// console.log(`VERIFY_TOKEN: ${VERIFY_TOKEN ? "已設置" : "未設置"}`);
// console.log(`PAGE_ACCESS_TOKEN: ${PAGE_ACCESS_TOKEN ? "已設置" : "未設置"}`);
// console.log(
//   `PAGE_ACCESS_TOKEN 長度: ${
//     PAGE_ACCESS_TOKEN ? PAGE_ACCESS_TOKEN.length : "N/A"
//   }`
// );

/**
 * 處理 webhook GET 請求 (用於驗證) 檢查 webhhok 那個
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */
exports.verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"]; // 從請求中獲取 hub.mode 參數
  const token = req.query["hub.verify_token"]; // 從請求中獲取 hub.verify_token 參數
  const challenge = req.query["hub.challenge"]; // 從請求中獲取 hub.challenge 參數

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

// 進行回應的邏輯判斷
/**
 * 驗證 webhook 傳進來的資料 (validateEntry)
 * 根據用戶 ID 查詢/建立用戶 (checkIsNewUser)
 * 根據用戶訊息進行處理 (handleIncomingMessage)
 * @param {Object} entry - webhook 事件資料
 * @returns {Promise<void>}
 */

async function handleWebhookEvent(entry) {
  try {
    // 1. 驗證使用者送出的資料
    if (!validateEntry(entry)) return; // 執行

    const webhookEvent = entry.messaging[0]; // 獲取第一個訊息
    const senderPsid = webhookEvent.sender.id; // 獲取發送者 PSID

    // 2. 處理用戶資料 (查詢/建立)
    const isNewUser = await checkIsNewUser(senderPsid);

    // 3. 處理並回覆用戶訊息，如果有 message
    if (!webhookEvent.message) return;
    await handleIncomingMessage(senderPsid, webhookEvent.message, isNewUser); // 處理用戶訊息
  } catch (error) {
    console.error("處理 webhook 事件時發生錯誤:", error.message);
    logger.logMessage(
      `處理 webhook 事件錯誤: ${error.message}`,
      "system",
      "error"
    );
  }
}

/**
 * 驗證 webhook 事件資料的有效性
 * @param {Object} entry - webhook 事件資料
 * @returns {boolean} 資料是否有效
 */
function validateEntry(entry) {
  console.log("處理 entry:", JSON.stringify(entry, null, 2));

  // 驗證 entry 是否存在且不為空
  if (!entry.messaging || entry.messaging.length === 0) {
    console.log("錯誤: entry.messaging 不存在或為空");
    return false;
  }

  const webhookEvent = entry.messaging[0]; // 獲取第一個訊息
  if (!webhookEvent.sender || !webhookEvent.sender.id) {
    console.log("錯誤: webhook_event.sender 或 id 不存在");
    return false;
  }

  return true;
}

/**
 * 處理用戶資料 - 查詢或建立新用戶
 * @param {string} senderPsid - 用戶 ID
 * @returns {Promise<boolean>} 是否為新用戶
 */

async function checkIsNewUser(senderPsid) {
  try {
    // 查找使用者的資料(使用索引加速查詢，只查詢必要字段)
    const user = await User.findOne({ userId: senderPsid }, { _id: 1 }).lean();

    // 如果找不到使用者，則建立新用戶
    if (!user) {
      console.log(`用戶 ${senderPsid} 是新朋友，正在添加到資料庫...`);
      const newUser = new User({
        userId: senderPsid, // 用戶 ID
        profile: { displayName: "未知用戶" }, // 注意: 您的 Schema 已將 profile 定義為 String
        stats: {
          messageCount: 1, // 訊息數量
          lastInteractionAt: new Date(), // 最後互動時間
        },
        lastSeen: new Date(), // 最後查看時間
      });

      await newUser.save(); // 儲存數據庫
      console.log(`用戶 ${senderPsid} 已成功添加到資料庫`);
      return true;
    } else {
      console.log(`用戶 ${senderPsid} 是老朋友`);
      await User.recordInteraction(senderPsid); // 記錄用戶的互動
      return false;
    }
  } catch (error) {
    console.error(`處理用戶資料時發生錯誤: ${error.message}`);
    // 即使出錯，我們仍然繼續處理訊息，不中斷流程
    return false;
  }
}

/**
 * 處理並記錄用戶的訊息
 * @param {string} senderPsid - 用戶 ID
 * @param {Object} message - 用戶訊息
 * @param {boolean} isNewUser - 是否為新用戶
 * @returns {Promise<void>}
 */
async function handleIncomingMessage(senderPsid, message, isNewUser) {
  // console.log(
  //   `收到來自 ${senderPsid} 的訊息:`,
  //   JSON.stringify(message, null, 2)
  // );

  // 如果訊息是文字訊息，則進行處理
  if (message.text) {
    // 處理文字訊息
    logTextMessage(senderPsid, message.text); // 記錄文字訊息
  } else if (message.attachments) {
    // 處理附件訊息
    const attachmentType = message.attachments[0]?.type || "未知";
    logAttachmentMessage(senderPsid, attachmentType); // 記錄附件訊息
  }

  // 產生並發送回覆
  await handleUserMessage(senderPsid, message);
}

/**
 * 記錄文字訊息
 * @param {string} senderPsid - 用戶 ID
 * @param {string} text - 訊息內容
 */
function logTextMessage(senderPsid, text) {
  const divider = "=".repeat(50);
  console.log("\n" + divider);
  console.log("📩 用戶訊息:");
  console.log("🔹 PSID:", senderPsid);
  console.log("🔹 時間:", new Date().toLocaleString());
  console.log("🔹 內容:", text);
  console.log(divider + "\n");

  logger.logMessage(`用戶發送訊息: ${text}`, senderPsid, "text");
}

/**
 * 記錄附件訊息
 * @param {string} senderPsid - 用戶 ID
 * @param {string} attachmentType - 附件類型
 */
function logAttachmentMessage(senderPsid, attachmentType) {
  const divider = "*".repeat(50);
  console.log("\n" + divider);
  console.log("📩 用戶發送了非文本內容:");
  console.log("🔹 PSID:", senderPsid);
  console.log("🔹 類型:", attachmentType);
  console.log(divider + "\n");

  logger.logMessage(
    `用戶發送了 ${attachmentType} 類型的附件`,
    senderPsid,
    attachmentType
  );
}

/**
 * 處理 webhook POST 請求，接收來自 Facebook 的 Webhook 事件，返回機器人的訊息
 * @param {object} req - 請求對象
 * @param {object} res - 回應對象
 */

exports.handleWebhook = async (req, res) => {
  // 他會返回 {time、id、messaging{sender_psid、recipient_psid、timestamp、message{text、attachments}}
  const { object, entry } = req.body; // 獲取接收到的訊息
  // console.log("收到webhook POST請求, body:", JSON.stringify(req.body, null, 2));

  // 如果 body.object 是 page(粉絲群) ，則進行處理
  // 如果用戶點擊按鈕、訂閱或取消訂閱頁面...等
  if (object === "page") {
    // 客戶正在與使用者進行互動(用戶發送消息、用戶訂閱頁面、用戶點擊按鈕、用戶發送回饋)

    // 如果 entry 是空的表示頁面存在但沒有觸發任何事件，或者請求的格式不正確、Webhook 設定有誤、權限不足或 Facebook 服務出現問題。
    if (!entry || entry.length === 0) {
      console.log("錯誤: entry 不存在或為空");
      return res.sendStatus(400);
    }

    // 對每個 entry 事件進行處理，為什麼要用 for loop 因為短時間內可能會有多次請求
    for (const ent of entry) {
      await handleWebhookEvent(ent); // 執行回應的動作
    }

    res.status(200).send("回應成功");
  } else {
    console.log(`收到非page對象的請求，實際為: ${object}`);
    res.sendStatus(404);
  }
};

/**
 * 處理用戶發送的訊息
 * @param {string} sender_psid - 發送者的 PSID
 * @param {object} received_message - 收到的訊息對象
 */
async function handleUserMessage(sender_psid, received_message) {
  console.log("開始處理訊息");

  // 檢查訊息是否包含文本，如果沒有收到訊息，則返回默認回應
  if (!received_message.text) {
    console.log("訊息不包含文本，可能是貼圖、附件或其他內容");

    // 如果是貼圖、附件等，可以返回默認回應
    const response = {
      text: "我收到了您的訊息，但目前只能回應文字內容。",
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
      text: aiResponse,
    };

    console.log(
      `準備回覆給 ${sender_psid}:`,
      JSON.stringify(response, null, 2)
    );
    await sendResponse(sender_psid, response);
  } catch (error) {
    console.error("AI 處理消息失敗:", error);

    // 失敗時使用默認回應
    const fallbackResponse = {
      text: `很抱歉，我暫時無法處理您的請求。請稍後再試。`,
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
    console.log(
      `發送訊息前的 PAGE_ACCESS_TOKEN 狀態: ${
        PAGE_ACCESS_TOKEN
          ? "已設置，長度為" + PAGE_ACCESS_TOKEN.length
          : "未設置"
      }`
    );

    console.log("發送請求到 Facebook API...");
    const apiUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    console.log("API URL:", apiUrl);

    const requestBody = {
      recipient: { id: sender_psid },
      message: response,
    };
    console.log("請求內容:", JSON.stringify(requestBody, null, 2));

    const result = await axios.post(apiUrl, requestBody);

    console.log("訊息發送成功, 回應:", JSON.stringify(result.data, null, 2));

    // 記錄機器人回覆
    logger.logMessage(
      `機器人回覆: ${JSON.stringify(response)}`,
      sender_psid,
      "bot_response"
    );

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
        console.error(
          `Facebook API 錯誤: ${fbError.message}, 代碼: ${fbError.code}, 類型: ${fbError.type}`
        );

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
    console.log(
      `PAGE_ACCESS_TOKEN 狀態: ${
        PAGE_ACCESS_TOKEN
          ? "已設置，長度為" + PAGE_ACCESS_TOKEN.length
          : "未設置"
      }`
    );

    const response = await axios.get(
      `https://graph.facebook.com/v19.0/me?access_token=${PAGE_ACCESS_TOKEN}`
    );

    console.log(
      "Facebook API 連接成功:",
      JSON.stringify(response.data, null, 2)
    );
    res.status(200).json({
      success: true,
      message: "Facebook API 連接成功",
      data: response.data,
    });
  } catch (error) {
    console.error("Facebook API 連接失敗:");

    let errorData = {
      message: "連接失敗",
      error: error.message,
    };

    if (error.response) {
      errorData.status = error.response.status;
      errorData.data = error.response.data;
    }

    console.error(JSON.stringify(errorData, null, 2));
    res.status(500).json({
      success: false,
      message: "Facebook API 連接失敗",
      error: errorData,
    });
  }
};
