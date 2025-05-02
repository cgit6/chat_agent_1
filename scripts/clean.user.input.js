function cleanUserInput(input) {
  return (
    input
      // 移除常見 emoji 和符號
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")

      // 移除非語意語助詞與注音文
      .replace(
        /(欸|呃|嗯+|那個|ㄏㄏ|ㄘ|ㄟ|ㄚ|咩+|哈+|嘿+|喔+|啊+|哦+|恩+)/gi,
        ""
      )

      // 將重複字（超過兩次）縮減為最多兩次
      .replace(/([\u4e00-\u9fa5a-zA-Z])\1{2,}/g, "$1$1") // 中文或英文字符

      // 移除多餘標點符號（連續的驚嘆號、逗號等）
      .replace(/[!！,.，。]{2,}/g, (match) => match[0])

      // 去除首尾空白與多個空白合併為一格
      .replace(/\s+/g, " ")
      .trim()
  );
}

module.exports = { cleanUserInput };
