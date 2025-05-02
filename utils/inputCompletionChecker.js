const config = require("../config");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require("@langchain/core/prompts");

const isGeminiInputComplete = async (currentSentence) => {
  try {
    const apiKey = config.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY 未設置，請在環境變量中添加");
    }

    const model = new ChatGoogleGenerativeAI({
      apiKey,
      modelName: "gemini-1.5-pro",
      temperature: 0.7,
      maxOutputTokens: 500,
    });

    const systemTemplate = `
    你是一個專門判斷使用者訊息是否輸入完畢的語言模型。

    你會收到一段對話歷史（可能包含使用者分次輸入的訊息）。你的任務是判斷使用者是否已經完成此次發言，或是否仍可能繼續輸入。

    請根據以下指標判斷：
    - 使用者語句是否語意完整？
    - 是否有未完的句子或語意懸空（例如「還有就是…」、「等一下再說」等）？
    - 是否語氣暗示還在思考或打算繼續（例如「我還有幾個問題…」、「等等喔…」等）？
    - 是否過去習慣連續輸入多句？

    請只輸出以下其中一個字串（**格式很重要**）：
    - false → 使用者可能還會繼續輸入，請等待。
    - true → 使用者輸入已結束，可以回應。

    用戶輸入: "{userMessage}"
    請返回 "true" 如果輸入完整，否則返回 "false"。`;

    const promptTemplate = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(systemTemplate),
      HumanMessagePromptTemplate.fromTemplate("{userMessage}"),
    ]);

    // ✅ 格式化訊息
    const messages = await promptTemplate.formatMessages({
      userMessage: currentSentence,
    });

    // ✅ 傳給模型
    const response = await model.invoke(messages);

    // ✅ 提取模型回應的文字
    const text = response.content || "";
    return text.trim().toLowerCase() === "true";
  } catch (error) {
    console.error("判斷輸入完整性失敗:", error);
    return false;
  }
};

// 將函數導出
module.exports = {
  isGeminiInputComplete,
};
