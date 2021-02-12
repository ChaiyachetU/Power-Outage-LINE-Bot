const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");

admin.initializeApp();
const db = admin.firestore();

const REGION = "asia-east2";

const LINE_MESSAGING_API = "https://api.line.me/v2/bot/message";
const LINE_HEADER = {
  "Content-Type": "application/json",
  Authorization:
    "Bearer {Your Channel Access Token}",
};

const MAP_API_KEY = "{Your Longdo Map API Key}";

// Set today time
const presentYear = new Date().getFullYear();
const presentMonth = new Date().getMonth();
const presentDay = new Date().getDate();
const todayTime = new Date(presentYear, presentMonth, presentDay).getTime();

// Convert date from scrape to time
const dateToTime = (dateInput) => {
  const date = dateInput.split(" ")[0];
  const hourMinute = dateInput.split(" ")[1];

  const day = parseInt(date.split("/")[0]);
  const month = parseInt(date.split("/")[1]) - 1;

  const year =
    date.split("/")[2] == presentYear
      ? parseInt(date.split("/")[2])
      : parseInt(date.split("/")[2]) - 543;

  const hour = parseInt(hourMinute.split(":")[0]);
  const minute = parseInt(hourMinute.split(":")[1]);

  return new Date(year, month, day, hour, minute).getTime();
};

// Scraper data from PEA url
const scraperPEA = async () => {
  const response = await axios.get(
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
    return item.startTime >= todayTime;
  });

  return result;
};

// Get user province name with lat ,lon
const province = async (location) => {
  const response = await axios.get(
    `https://api.longdo.com/map/services/address?lon=${location.longitude}&lat=${location.latitude}&key=${MAP_API_KEY}`
  );

  const province = response.data.province;

  return province === "กรุงเทพมหานคร" ? province : province.slice(2);
};

// Message item PEA
const messagePEABubble = (item) => {
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
    method: "post",
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

// Reply message to user
const replyMessage = (message, replyToken) => {
  if (message.length !== 0) {
    return axios({
      method: "post",
      url: `${LINE_MESSAGING_API}/reply`,
      headers: LINE_HEADER,
      data: JSON.stringify({
        replyToken: replyToken,
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
  } else {
    return axios({
      method: "post",
      url: `${LINE_MESSAGING_API}/reply`,
      headers: LINE_HEADER,
      data: JSON.stringify({
        replyToken: replyToken,
        messages: [
          {
            type: "flex",
            altText: "⚠️ ประกาศแจ้งเตือนดับไฟ ⚠️",
            contents: {
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
                    type: "text",
                    text: "⚠️ ไม่พบ ประกาศแจ้งเตือนดับไฟ",
                    wrap: true,
                    align: "center",
                  },
                  {
                    type: "text",
                    text: "ในพื้นที่ของท่าน ⚠️",
                    align: "center",
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
                      label: "ติดต่อ Call Center 📱",
                      uri: "tel:1129",
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
            },
          },
        ],
      }),
    });
  }
};

// Quick reply for user send location
const quickReply = (replyToken) => {
  return axios({
    method: "post",
    url: `${LINE_MESSAGING_API}/reply`,
    headers: LINE_HEADER,
    data: JSON.stringify({
      replyToken: replyToken,
      messages: [
        {
          type: "text",
          text: "Please send your location.",
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "location",
                  label: "Send Location",
                },
              },
            ],
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
    const data = await scraperPEA();

    if (data.length !== 0) {
      // Set data to cloud firestore
      data.forEach(async (item) => {
        await db
          .collection("peaoutage")
          .doc(`${item.id}`)
          .set(item, { merge: true });
      });
    } else {
      console.log("Scraper not found documents");
    }

    return null;
  });

// Get request location and return result from cloud firestore to user
exports.replyPeaOutage = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    console.log("🚀 Start Webhook!!", JSON.stringify(req.body));

    if (!req.body.events) {
      res.status(200).end();
    }

    const requestEvents = req.body.events[0];

    if (typeof requestEvents === "undefined") {
      res.status(200).end();
    }

    try {
      if (requestEvents.type === "message") {
        // Check user send text
        if (requestEvents.message.type === "text") {
          const message = requestEvents.message.text;

          // Check for send quick reply for user return location
          if (message.toLowerCase() === "check outage plan") {
            const replyToken = requestEvents.replyToken;

            // Reply quick reply for user send location
            quickReply(replyToken);
          }

          res.status(200).end();
        }

        // Check user send location
        if (requestEvents.message.type === "location") {
          const replyToken = requestEvents.replyToken;
          const latitude = requestEvents.message.latitude;
          const longitude = requestEvents.message.longitude;

          const userLocation = {
            latitude,
            longitude,
          };

          // Get user province name with user lat,lon
          const userProvince = await province(userLocation);
          console.log(userProvince);

          // Set query start time for tomorrow = today + 24 hour
          const tomorrow = todayTime + 86400000;

          // Get data from cloud firestore wiht limit 12 items (*** Bubbles within a carousel. Max: 12 bubbles)
          const carouselContents = await db
            .collection("{Your Collection}")
            .where("province", "==", userProvince)
            .where("startTime", ">=", tomorrow)
            .orderBy("startTime", "asc")
            .limit(12)
            .get()
            .then((snapshot) => {
              const bubbles = [];

              // Check snapshot documents !== empty
              if (!snapshot.empty) {
                snapshot.forEach((doc) => {
                  // Create message with doc data
                  const item = doc.data();
                  bubbles.push(messagePEABubble(item));
                });
              } else {
                console.log("Not found documents");
              }

              return bubbles;
            });

          // Reply message to user
          replyMessage(carouselContents, replyToken);

          res.status(200).send("Completed");
        }
      }
    } catch (err) {
      console.error(err);
      res.status(500).end();
    }

    res.status(200).end();
  });
