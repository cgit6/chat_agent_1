// node scripts/fsm.chat.js
const { isGeminiInputComplete } = require("../utils/inputCompletionChecker");
/**
 * 對話狀態機 - 處理用戶對話的狀態轉換
 */
class DialogueFSM {
  constructor(timeoutMs = 10000) {
    this.state = "START"; // START, BUFFERING, DONE
    this.buffer = [];
    this.timeout = timeoutMs; // 超時時間
    this.timer = null; // 定時器
    this.resolveTimeout = null; // 超時回應
  }

  // 判斷用戶訊息
  async handleInput(text) {
    this.clearTimer();

    const combinedText = [...this.buffer, text].join("");

    switch (this.state) {
      case "START": {
        const isComplete = await isGeminiInputComplete(combinedText); // 判斷是否完整

        // 如果完整，則進入 DONE 狀態
        if (isComplete || this.isFinalPart(text)) {
          this.state = "DONE";
          return {
            shouldRespond: true,
            message: combinedText,
          };
        } else {
          this.state = "BUFFERING";
          this.buffer.push(text);
          this.startTimeout();
          return {
            shouldRespond: false,
            message: "請繼續補充您的訊息。",
          };
        }
      }

      case "BUFFERING": {
        this.buffer.push(text);
        const fullMessage = this.buffer.join("");

        const isComplete = await isGeminiInputComplete(fullMessage);
        if (isComplete || this.isFinalPart(text)) {
          this.state = "DONE";
          const output = fullMessage;
          this.reset();
          return {
            shouldRespond: true,
            message: output,
          };
        } else {
          this.startTimeout();
          return {
            shouldRespond: false,
            message: "看起來還沒說完喔，請繼續補充。",
          };
        }
      }

      case "DONE": {
        this.reset(); // 重置狀態
        return this.handleInput(text); // 遞迴處理
      }
    }
  }

  isFinalPart(text) {
    const endsWithPunctuation = /[。！？.?!]$/.test(text);
    const hasFinalKeywords =
      /(謝謝|感謝|就這樣|麻煩了|好了|結束|OK|拜託)/i.test(text);
    return endsWithPunctuation || hasFinalKeywords;
  }

  startTimeout() {
    this.clearTimer();

    this.timer = setTimeout(() => {
      if (this.state === "BUFFERING") {
        this.state = "DONE";
        if (this.resolveTimeout) {
          const output = this.buffer.join("");
          this.resolveTimeout({
            shouldRespond: true,
            message: output,
            reason: "timeout",
          });
          this.reset();
        }
      }
    }, this.timeout);
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // 外部可以等待超時回應
  waitForTimeoutResponse() {
    return new Promise((resolve) => {
      this.resolveTimeout = resolve;
    });
  }

  reset() {
    this.state = "START";
    this.buffer = [];
    this.clearTimer();
    this.resolveTimeout = null;
  }
}

module.exports = DialogueFSM;

// 測試
(async () => {
  const fsm = new DialogueFSM(10000); // 10秒沒輸入就自動回應

  // 第一段輸入
  const result1 = await fsm.handleInput("太誇張了");
  console.log(result1); // => { shouldRespond: false, message: '請繼續補充您的訊息。' }

  // 等使用者下一段輸入，或者觸發超時
  fsm.waitForTimeoutResponse().then((timeoutResult) => {
    console.log("超時自動觸發：", timeoutResult);
  });

  // 例如 8 秒後使用者又輸入一段：
  setTimeout(async () => {
    const result2 = await fsm.handleInput("帽子很多都沒到貨");
    console.log("新輸入：", result2);
  }, 8000);
})();

module.exports = DialogueFSM;
