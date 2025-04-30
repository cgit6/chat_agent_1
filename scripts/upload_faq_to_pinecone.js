const {
  uploadFaqToPinecone,
  uploadEnrichedFaqToPinecone,
} = require("../utils/vectorStoreHandler");

// 執行上傳 QA 到向量資料庫中
// 現在應該也要一併上傳到 普通的資料庫
async function main() {
  try {
    console.log("開始處理並上傳豐富後的 FAQ 資料到 Pinecone...");
    // const result = await uploadFaqToPinecone(); // 這是沒有添加屬性的函數單純將資料上傳到向量資料庫中
    const result = await uploadEnrichedFaqToPinecone(); // 這是添加屬性的函數將資料上傳到向量資料庫中

    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.error(`❌ ${result.message}`);
    }
  } catch (error) {
    console.error("上傳過程中發生錯誤:", error.message);
  }
}

main();
