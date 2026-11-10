
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const inputDir = "./input";
const outputDir = "./output";

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs
    .readdirSync(inputDir)
    .filter((file) => file.endsWith(".html"))
    .sort();

  if (files.length === 0) {
    throw new Error("변환할 HTML 파일이 없습니다.");
  }

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1080,
        height: 1350
      },
      deviceScaleFactor: 1
    });

    for (const file of files) {
      const inputPath = path.join(inputDir, file);
      const outputName = file.replace(/\.html$/i, ".png");
      const outputPath = path.join(outputDir, outputName);

      await page.goto(
        "file://" + path.resolve(inputPath),
        { waitUntil: "networkidle" }
      );

      await page.screenshot({
        path: outputPath,
        fullPage: false,
        type: "png"
      });

      console.log(`이미지 생성 완료: ${outputName}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
