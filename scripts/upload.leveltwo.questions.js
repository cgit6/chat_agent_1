/**
 * 腳本 - 上傳基礎客服問答到 MongoDB
 *
 * 此腳本會從 data/customer_service_faq_with_meta.json 讀取問答數據
 * 並上傳到 MongoDB 的 LevelOneQuestion 集合中
 *
 * 執行 node scripts/upload.levelone.questions.js
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDB } = require("../models/db");
const LevelOneQuestion = require("../models/LevelOneQuestion");
const config = require("../config");

// 讀取問答數據
const loadQuestions = () => {
  try {
    const filePath = path.join(
      __dirname,
      "../data/customer_service_faq_with_meta.json"
    );
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("讀取問答數據失敗:", error.message);
    throw error;
  }
};

// 清空現有問答數據
const clearExistingQuestions = async () => {
  try {
    const result = await LevelOneQuestion.deleteMany({});
    console.log(`已清空現有問答數據: 刪除了 ${result.deletedCount} 條記錄`);
  } catch (error) {
    console.error("清空問答數據失敗:", error.message);
    throw error;
  }
};

// 上傳問答數據到 MongoDB
const uploadQuestions = async (questions) => {
  try {
    const result = await LevelOneQuestion.insertMany(questions);
    return result.length;
  } catch (error) {
    console.error("上傳問答數據失敗:", error.message);
    throw error;
  }
};

// 主函數
async function main() {
  try {
    console.log("開始上傳基礎客服問答到 MongoDB...");

    // 連接 MongoDB
    await connectDB();

    // 讀取問答數據
    const questions = loadQuestions();
    console.log(`成功讀取 ${questions.length} 條問答數據`);

    // 清空現有問答數據
    await clearExistingQuestions();

    // 上傳問答數據到 MongoDB
    const count = await uploadQuestions(questions);
    console.log(`✅ 成功上傳 ${count} 條問答數據到 MongoDB`);

    // 斷開 MongoDB 連接
    await mongoose.disconnect();
    console.log("已斷開 MongoDB 連接");

    process.exit(0);
  } catch (error) {
    console.error("上傳過程中發生錯誤:", error);
    process.exit(1);
  }
}

// 執行主函數
main();
