const functions = require("firebase-functions");
const axios = require("axios");
const cheerio = require("cheerio");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const REGION = "asia-east2";

const LINE_MESSAGING_API = "https://api.line.me/v2/bot/message";
const LINE_HEADER = {
  "Content-Type": "application/json",
  Authorization:
    "Bearer bbJqq+KwNZOiPo4hcfYFZMxpra0nXZy2HR0nAb8wCUWJFfXblzOga5cRYM8Xu8J0tk4sxu5i1MIKnUjXazzwY9W6sikbE0tRQJv3QvofEST02+gN612lmSm3cAkDIf/QQSAhY7Xw6xKBUJZ32edW0QdB04t89/1O/w1cDnyilFU==",
};

// Set today time
const year = new Date().getFullYear();
const month = new Date().getMonth();
const day = new Date().getDate();
const today = new Date(year, month, day).getTime();

// Convert date from scrape to time
const dateToTime = (dateInput) => {
  const date = dateInput.split(" ")[0];

  const day = parseInt(date.split("/")[0]);
  const month = parseInt(date.split("/")[1]) - 1;
  const year = parseInt(date.split("/")[2]) - 543;

  return new Date(year, month, day).getTime();
};

// Scraper data from url
const scraper = async () => {
  const response = await axios(
    "https://www.pea.co.th/WebApplications/Outage/New/Index.aspx"
  );

  const html = response.data;

  const $ = cheerio.load(html);

  const scrapedData = [];

  $("#tblOutage tbody tr").each((index, element) => {
    const tds = $(element).find("td");

    const province = $(tds[1]).text();

    const area = $(tds[2]).text();

    const linkUrl =
      "https://www.pea.co.th/WebApplications/Outage/New/" +
      $(tds[2]).find("a").attr("href");

    const id = linkUrl.split("=")[1];

    // Get start date format is dd/mm/yyyy(buddhist) hh:mm
    const startDate = $(tds[3]).text();

    // Convert to time format
    const startTime = dateToTime(startDate);

    // Get end date format is dd/mm/yyyy(buddhist) hh:mm
    const endDate = $(tds[4]).text();

    // Convert to time format
    const endTime = dateToTime(endDate);

    // Set table row data
    const tableRow = {
      province,
      area,
      linkUrl,
      id,
      startDate,
      startTime,
      endDate,
      endTime,
    };

    scrapedData.push(tableRow);
  });

  // Filter for start time >= today
  const result = scrapedData.filter((item) => {
    return item.startTime >= today;
  });

  return result;
};

// Message item
const messageBubble = (item) => {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "⚠️ ประกาศแจ้งเตือนดับไฟ ⚠️",
          size: "lg",
          align: "center",
        },
        {
          type: "text",
          text: "🛠 เนื่องจากมีการปฏิบัติงาน 👷🏼",
          size: "lg",
          align: "center",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: `📣 จังหวัด ${item.province}`,
              weight: "bold",
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: "❌ บริเวณพื้นที่ไฟดับ",
              weight: "bold",
            },
          ],
          margin: "lg",
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: `${item.area}`,
              wrap: true,
            },
          ],
          margin: "sm",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "เริ่มดับไฟ",
              weight: "bold",
            },
            {
              type: "text",
              text: `🕗 ${item.startDate}`,
            },
          ],
          margin: "lg",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "สิ้นสุดการดับไฟ",
              weight: "bold",
            },
            {
              type: "text",
              text: `🕓 ${item.endDate}`,
            },
          ],
          margin: "lg",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "รายละเอียดเพิ่มเติม",
            uri: `${item.linkUrl}`,
          },
          style: "primary",
        },
      ],
    },
    styles: {
      body: {
        separator: true,
      },
    },
  };
};

// Push message to user
const pushMessage = (message) => {
  return axios({
    method: "POST",
    url: `${LINE_MESSAGING_API}/push`,
    headers: LINE_HEADER,
    data: JSON.stringify({
      to: "U71cfb0b70391af3376b16bfac0197ce0",
      messages: [
        {
          type: "flex",
          altText: "⚠️ ประกาศแจ้งเตือนดับไฟ ⚠️",
          contents: {
            type: "carousel",
            contents: message,
          },
        },
      ],
    }),
  });
};

// Get data and set to cloud firestore
exports.getPeaOutage = functions
  .region(REGION)
  .pubsub.schedule("0 3 * * *")
  .timeZone("Asia/Bangkok")
  .onRun(async (context) => {
    // console.info("This will be run every 03:00 AM");
    // Get data with scraper
    const data = await scraper();

    // Set data to cloud firestore
    data.forEach(async (item) => {
      await db.collection("peaoutage").doc(`${item.id}`).set(item);
    });

    return null;
  });

// Push message to user every 08:00 AM
exports.outageBotPushMessage = functions
  .region(REGION)
  .pubsub.schedule("0 8 * * *")
  .timeZone("Asia/Bangkok")
  .onRun(async (context) => {
    // Set query start time for tomorrow = today + 24 hour
    const tomorrow = today + 86400000;

    // Get data from cloud firestore wiht limit 12 items (*** Bubbles within a carousel. Max: 12 bubbles)
    const carouselContents = await db
      .collection("peaoutage")
      .where("province", "==", "ปทุมธานี")
      .where("startTime", "==", tomorrow)
      .limit(12)
      .get()
      .then((snapshot) => {
        const bubbles = [];

        // Check snapshot documents !== empty
        if (!snapshot.empty) {
          snapshot.forEach((doc) => {
            // Create message with doc data
            bubbles.push(messageBubble(doc.data()));
          });
        } else {
          console.log("Not found documents");
        }

        return bubbles;
      });

    // Check items !== empty
    if (carouselContents.length !== 0) {
      // Push message to user
      pushMessage(carouselContents);
    }

    return null;
  });
