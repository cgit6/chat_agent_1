const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "你的Page Token";
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "你自己定義的驗證碼";

const app = express();
app.use(bodyParser.json());

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    body.entry.forEach((entry) => {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      }
    });

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

async function handleMessage(sender_psid, received_message) {
  const response = {
    text: `你剛說了：${received_message.text}`,
  };

  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: sender_psid },
      message: response,
    }
  );
}

// 根路徑的健康檢查端點
app.get("/", (req, res) => {
  res.status(200).send("Facebook Messenger Bot is running!");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
