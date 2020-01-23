import puppeteer from "puppeteer-core";
import fs from "fs";
import axios from "axios";
import path from "path";

const slugify = text =>
  text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const download_image = (url, image_path) =>
  axios({
    url,
    method: "get",
    responseType: "stream"
  }).then(
    response =>
      new Promise((resolve, reject) => {
        response.data
          .pipe(fs.createWriteStream(image_path))
          .on("finish", () => resolve())
          .on("error", e => reject(e));
      })
  );

async function getPinDetails(page, url) {
  console.log(url);
  await page.goto(url, {
    waitUntil: "networkidle0"
  });

  await timeout(100);
  const img = await page.$eval(
    `img[src^="https://i.pinimg.com/"]`,
    img => img.src
  );

  const setNull = () => null;
  const title = await page.$eval(`h1`, h => h.innerText).catch(setNull);
  const source = await page
    .$eval(`a[rel="nofollow"]`, node => node.innerText)
    .catch(setNull);

  return { url, img, title, source };
}

let browser;
async function main(board) {
  browser =
    browser ||
    (await puppeteer.launch({
      defaultViewport: null,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: false
    }));
  const page = await browser.newPage();
  const boardDir = path.join(__dirname, "output", new URL(board).pathname);
  await page.goto(board, {
    waitUntil: "networkidle0"
  });
  const limit = await page.$eval(`.tBJ.dyH.iFc.SMy.yTZ.pBj.DrD.IZT.mWe`, node =>
    parseInt(node.innerText)
  );

  const pins = new Set();
  for (let index = 0; index < 23; index++) {
    const currentpins = await page.$$eval(`a[href^="/pin/"]`, pins =>
      pins.map(pin => pin.href)
    );
    await page.$$eval(`a[href^="/pin/"]`, pins =>
      pins[pins.length - 1].scrollIntoView({
        behavior: "instant",
        block: "end",
        inline: "end"
      })
    );
    await timeout(500);
    currentpins.forEach(pin => pins.size <= limit && pins.add(pin));
    console.log(pins.size, limit);
    if (pins.size >= limit) {
      break;
    }
  }

  console.log(pins);

  const image_dir = path.join(boardDir, "images");
  if (!fs.existsSync(image_dir)) {
    fs.mkdirSync(image_dir, { recursive: true });
  }

  let i = 0;
  for (const pin of Array.from(pins)) {
    await getPinDetails(page, pin)
      .then(async ({ url, board, img, title, source }) => {
        console.log(i, url, (i / pins.size) * 100, "%");
        await download_image(
          img,
          path.join(
            image_dir,
            slugify(new URL(url).pathname).replace("pin", "") + ".jpg"
          )
        );
        fs.appendFileSync(
          path.join(boardDir, "pins.jsonl"),
          JSON.stringify({ url, board, img, title, source }) + "\n"
        );
      })
      .catch(console.err);
    i++;
  }
}

const boards = [
  // Board links
];

async function loop(boards) {
  for (const board of boards) {
    await main(board)
      .then(() => console.log("Done.", board))
      .catch(err => {
        if (browser) {
          browser.close();
          browser = null;
        }
        console.error("Failed", board, err);
      });
  }
}

loop(boards);
