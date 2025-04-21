# 使用官方Node.js輕量級鏡像
FROM node:18-slim

# 安裝 curl 用於健康檢查
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# 創建應用目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安裝依賴
RUN npm install --production

# 複製源碼
COPY . .

# 設定環境變量
ENV PORT=8080
ENV NODE_ENV=production
# Facebook Messenger Token 將從 Cloud Run 環境變量中傳入
# ENV PAGE_ACCESS_TOKEN=
# ENV VERIFY_TOKEN=

# 暴露端口
EXPOSE 8080

# 健康檢查（確保應用已啟動）
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT} || exit 1

# 啟動命令
CMD ["npm", "start"] 