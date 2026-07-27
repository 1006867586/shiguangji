/**
 * 本地测试：联网搜索补齐店铺信息
 *
 * 用法：
 *   node scripts/test-search-place.mjs
 *   node scripts/test-search-place.mjs "自定义店名"
 *
 * 需要 .env.local 中配置 MINIMAX_API_KEY
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- 读取 .env.local ----------
function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[m[1]] = val;
      }
    }
  } catch {
    // ignore
  }
}
loadEnvLocal();

const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = process.env.MINIMAX_ANTHROPIC_BASE_URL || "https://api.minimaxi.com/anthropic";
const MODEL = process.env.MINIMAX_ANTHROPIC_MODEL || "MiniMax-M3";

if (!API_KEY) {
  console.error("❌ 未配置 MINIMAX_API_KEY，请在 .env.local 中设置后重试");
  process.exit(1);
}

// ---------- 店铺信息 ----------
const place = {
  title: process.argv[2] || "狮龙聚会·青山老牌烧烤(恩施街店)",
  address: null,
  phone: null,
  category: "烧烤",
  summary: "",
  platform: "unknown",
};

const SYSTEM_PROMPT = [
  "你是一个店铺信息检索助手，只能输出 JSON。",
  "用户会给你一家餐厅/店铺的名称、地址等已知信息，请你使用 web_search 工具联网搜索，补齐这家店的：",
  "1. 封面图 URL（coverImageUrl）：店铺首页/详情页的封面图，必须是可直接访问的图片 URL（以 http 开头）",
  "2. 店铺链接（storeUrl）：必须是大众点评网（dianping.com）的店铺详情页 URL，不要返回美团、小红书、抖音等其他平台链接",
  "3. 电话（phone）：店铺联系电话",
  "4. 地址（address）：店铺完整地址",
  "搜索时强制使用「店名 + 城市/地址 + 大众点评」作为关键词，确保搜索结果来自大众点评网。",
  "搜索不到的字段返回 null，不要编造。",
  "",
  "【输出格式硬性要求】",
  "- 输出必须是单个合法 JSON 对象，第一个字符必须是 {，最后一个字符必须是 }",
  "- 不要输出任何引导语、解释、思考过程、markdown 代码块标记",
  "- 不要说“我来帮你搜索”之类的话，直接输出 JSON",
  "",
  "【storeUrl 域名硬性要求】",
  "- 必须是 dianping.com 或其子域名（如 www.dianping.com、m.dianping.com）",
  "- 或大众点评短链 dpurl.cn",
  "- 不要返回 meituan.com、xiaohongshu.com、douyin.com 等其他平台链接",
  "- 搜索不到大众点评链接时返回 null，不要用其他平台链接替代",
].join("\n");

function buildPrompt(p) {
  const known = [`店名：${p.title}`];
  if (p.address) known.push(`已知地址：${p.address}`);
  if (p.phone) known.push(`已知电话：${p.phone}`);
  if (p.category) known.push(`分类：${p.category}`);
  if (p.summary) known.push(`简介：${p.summary}`);
  return [
    "请联网搜索以下店铺信息，并直接输出 JSON（第一个字符必须是 {）：",
    "",
    "已知信息：",
    ...known,
    "",
    "搜索关键词建议：店名 + 地址所在城市 + “大众点评”",
    "",
    "JSON 格式：",
    "{",
    '  "coverImageUrl": "https://...jpg 或 null",',
    '  "storeUrl": "https://www.dianping.com/shop/XXXX 或 null",',
    '  "phone": "电话号码 或 null",',
    '  "address": "完整地址 或 null"',
    "}",
    "",
    "字段要求：",
    "- coverImageUrl 必须是图片直链，不能是网页 URL",
    "- storeUrl 必须是大众点评网（dianping.com 或 dpurl.cn）的店铺详情页 URL",
    "- 搜索不到的字段必须为 null",
    "",
    "再次强调：直接输出 JSON，不要说任何话。storeUrl 只接受大众点评网链接。",
  ].join("\n");
}

// ---------- 调用 MiniMax Anthropic API ----------
async function search() {
  const body = {
    model: MODEL,
    max_tokens: 8192,
    temperature: 0.3,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(place) }],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  };

  console.log("═══════════════════════════════════════════════");
  console.log("🔍 搜索店铺:", place.title);
  console.log("📡 API:", `${BASE_URL}/v1/messages`);
  console.log("🤖 模型:", MODEL);
  console.log("⏱️  超时: 80s");
  console.log("═══════════════════════════════════════════════\n");

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 80_000);

  try {
    const res = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`✅ HTTP ${res.status} (${elapsed}s)\n`);

    const data = await res.json();

    if (!res.ok) {
      console.error("❌ API 返回错误:");
      console.error(JSON.stringify(data, null, 2));
      return;
    }

    // 打印完整响应结构（调试用）
    console.log("📦 响应结构:");
    console.log("  stop_reason:", data.stop_reason);
    console.log("  content blocks:", (data.content ?? []).map((b) => b.type).join(", "));
    console.log("  usage:", JSON.stringify(data.usage ?? {}));
    console.log("");

    // 提取 text 块
    const textParts = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text);
    const text = textParts.join("\n\n");

    console.log("📝 模型输出文本:");
    console.log("───────────────────────────────");
    console.log(text || "(空)");
    console.log("───────────────────────────────\n");

    // 打印搜索结果摘要
    const searchResults = (data.content ?? []).filter(
      (b) => b.type === "web_search_tool_result"
    );
    if (searchResults.length > 0) {
      console.log(`🔎 联网搜索结果 (${searchResults.length} 组):`);
      for (const sr of searchResults) {
        const results = sr.content ?? [];
        console.log(`  共 ${results.length} 条结果:`);
        for (const r of results.slice(0, 5)) {
          console.log(`    • ${r.title}`);
          console.log(`      ${r.url}`);
        }
      }
      console.log("");
    }

    // 尝试解析 JSON
    if (text) {
      try {
        let jsonStr = text.trim();
        // 提取最后一个 {...} 块
        const lastBrace = jsonStr.lastIndexOf("}");
        if (lastBrace > 0) {
          let depth = 0;
          let startIdx = -1;
          for (let i = lastBrace; i >= 0; i--) {
            if (jsonStr[i] === "}") depth++;
            else if (jsonStr[i] === "{") {
              depth--;
              if (depth === 0) { startIdx = i; break; }
            }
          }
          if (startIdx >= 0) jsonStr = jsonStr.slice(startIdx, lastBrace + 1);
        }
        const parsed = JSON.parse(jsonStr);
        console.log("✅ 解析成功 JSON:");
        console.log(JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.error("❌ JSON 解析失败:", e.message);
      }
    }
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      console.error("❌ 请求超时（80s）");
    } else {
      console.error("❌ 请求失败:", e.message);
    }
  }
}

search();
