
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const inputDir = "./input";
const outputDir = "./output";
const renderedDir = "./rendered";

const dataPath = path.join(inputDir, "data.json");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function numberValue(value) {
  const n = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function directionClass(value) {
  const n = numberValue(value);

  if (n === null || n === 0) return "neutral";
  return n > 0 ? "up" : "down";
}

function signedPercent(value) {
  const n = numberValue(value);

  if (n === null) return "확인 불가";
  return `${n > 0 ? "+" : ""}${value}%`;
}

function getArrayItem(array, oneBasedIndex) {
  if (!Array.isArray(array)) return undefined;
  return array[oneBasedIndex - 1];
}

function resolveExpression(expression, htmlBefore) {
  const expr = expression.trim();

  // 날짜
  if (expr.includes("market_date")) {
    return escapeHtml(data.market_date ?? "");
  }

  // 시장 상태
  if (expr.includes("market_status")) {
    return escapeHtml(data.market_status ?? "");
  }

  // 시장 종합 분석
  if (expr.includes("market_analysis") && !expr.includes("korea_market_analysis")) {
    return escapeHtml(data.market_analysis ?? "");
  }

  // 국내 증시 분석
  if (expr.includes("korea_market_analysis") || expr.includes("domestic_market_analysis")) {
    return escapeHtml(
      data.korea_market_analysis ??
      data.domestic_market_analysis ??
      "국내 증시 분석 데이터가 없습니다."
    );
  }

  // 다음 거래일 전망
  if (expr.includes("tomorrow_focus") || expr.includes("tomorrow_checkpoints")) {
    return escapeHtml(
      data.tomorrow_focus ??
      data.tomorrow_checkpoints ??
      "다음 거래일 주요 일정 확인이 필요합니다."
    );
  }

  // 주요 지수: indices 배열
  const indexMatch = expr.match(/indices;\s*["'](\d+)\.(value|change_percent)["']/);

  if (indexMatch) {
    const item = getArrayItem(data.indices, Number(indexMatch[1]));
    const field = indexMatch[2];
    const value = item?.[field];

  if (field === "change_percent") {
  if (/class=["'][^"']*$/.test(htmlBefore)) {
    return directionClass(value);
  }
  if (expr.includes("if(parseNumber")) {
    return numberValue(value) > 0 ? "+" : "";
  }
  return escapeHtml(value ?? "0");
}

  // 통화 및 원자재 지표
  const currencyMatch = expr.match(
    /currency_market\.(usd_krw|us_10y_yield|wti_oil|gold)\.(value|change_percent|change)/
  );

  if (currencyMatch) {
    const item = data.currency_market?.[currencyMatch[1]];
    const field = currencyMatch[2];
    const value = item?.[field];

 if (field === "change_percent") {
  if (/class=["'][^"']*$/.test(htmlBefore)) {
    return directionClass(value);
  }
  if (expr.includes("if(parseNumber")) {
    return numberValue(value) > 0 ? "+" : "";
  }
  return escapeHtml(value ?? "0");
}

    return escapeHtml(value ?? (field === "change" ? "변동 확인 불가" : "확인 불가"));
  }

  // 주요 종목
  const stockMatch = expr.match(
    /featured_stocks;\s*["'](\d+)\.(name|change_percent|reason)["']/
  );

  if (stockMatch) {
    const item = getArrayItem(data.featured_stocks, Number(stockMatch[1]));
    const field = stockMatch[2];
    const value = item?.[field];

   if (field === "change_percent") {
  if (/class=["'][^"']*$/.test(htmlBefore)) {
    return directionClass(value);
  }
  if (expr.includes("if(parseNumber")) {
    return numberValue(value) > 0 ? "+" : "";
  }
  return escapeHtml(value ?? "0");
}

    return escapeHtml(value ?? (field === "reason" ? "분석 근거 데이터 없음" : "데이터 없음"));
  }

  // 경제 이슈
  const issueMatch = expr.match(
    /economic_issues;\s*(\d+)\s*\);\s*["'](title|description)["']/
  );

  if (issueMatch) {
    const item = getArrayItem(data.economic_issues, Number(issueMatch[1]));
    const field = issueMatch[2];

    return escapeHtml(
      item?.[field] ??
      (field === "title" ? "추가 경제 이슈 없음" : "상세 내용 확인 불가")
    );
  }

  // 위에서 처리하지 못한 표현식은 원문 대신 빈 값으로 처리
  console.warn("처리하지 못한 HTML 표현식:", expr);
  return "";
}

function renderTemplate(html) {
  return html.replace(/\{\{([\s\S]*?)\}\}/g, (match, expression, offset) => {
    const before = html.slice(Math.max(0, offset - 100), offset);
    return resolveExpression(expression, before);
  });
}

async function main() {
  if (!fs.existsSync(dataPath)) {
    throw new Error("input/data.json 파일이 없습니다.");
  }

  data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(renderedDir, { recursive: true });

  const files = fs.readdirSync(inputDir)
    .filter(file => /^page\d+\.html$/i.test(file))
    .sort((a, b) => {
      const numA = Number(a.match(/\d+/)[0]);
      const numB = Number(b.match(/\d+/)[0]);
      return numA - numB;
    });

  if (files.length !== 4) {
    throw new Error(`HTML 파일은 4개가 필요합니다. 현재 ${files.length}개입니다.`);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1
    });

    for (const file of files) {
      const inputPath = path.join(inputDir, file);
      const renderedPath = path.join(renderedDir, file);
      const outputName = file.replace(/\.html$/i, ".png");
      const outputPath = path.join(outputDir, outputName);

      const originalHtml = fs.readFileSync(inputPath, "utf8");
      const finalHtml = renderTemplate(originalHtml);

      fs.writeFileSync(renderedPath, finalHtml, "utf8");

      await page.goto(
        "file://" + path.resolve(renderedPath),
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

let data = {};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
