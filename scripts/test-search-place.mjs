/**
 * 本地测试：两步式联网搜索补齐店铺信息
 *
 * 问题背景：M3 + web_search 服务端工具在严格 prompt 下会"搜完即止"，
 * 不生成最终 text 回复。改为两步：
 *   步骤1: 带 web_search 工具，让模型搜索并返回完整搜索结果
 *   步骤2: 把搜索结果作为上下文，让模型输出 JSON（不带工具）
 *
 * 用法：node scripts/test-search-place.mjs [店名]
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
  } catch {}
}
loadEnvLocal();

const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = process.env.MINIMAX_ANTHROPIC_BASE_URL || "https://api.minimaxi.com/anthropic";
const MODEL = process.env.MINIMAX_ANTHROPIC_MODEL || "MiniMax-M3";

if (!API_KEY) {
  console.error("❌ 未配置 MINIMAX_API_KEY");
  process.exit(1);
}

const place = {
  title: process.argv[2] || "狮龙聚会·青山老牌烧烤(恩施街店)",
  category: "烧烤",
};

// ---------- 步骤 1：带 web_search 工具搜索 ----------
async function step1Search() {
  console.log("═══════ 步骤 1: 联网搜索 ═══════\n");

  const body = {
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.3,
    system: "你是店铺信息检索助手。请使用 web_search 工具联网搜索用户提供的店铺，找出大众点评网链接、电话、地址、封面图。搜索时务必尝试多个关键词，包括「店名 大众点评」「店名 电话 地址」「店名 城市 点评」。搜索完成后简要总结找到的信息。",
    messages: [{
      role: "user",
      content: `请搜索这家店：${place.title}（分类：${place.category}）\n\n请务必尝试以下搜索关键词：\n1. "${place.title} 大众点评"\n2. "${place.title} 电话 地址 武汉"\n3. "${place.title} dianping"`,
    }],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  };

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 80_000);

  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ HTTP ${res.status} (${elapsed}s)\n`);

  const data = await res.json();
  if (!res.ok) {
    console.error("❌ API 错误:", JSON.stringify(data, null, 2));
    return null;
  }

  // 提取所有搜索结果
  const allResults = [];
  const textParts = [];
  for (const block of data.content ?? []) {
    if (block.type === "web_search_tool_result") {
      for (const r of block.content ?? []) {
        allResults.push({
          title: r.title ?? "",
          url: r.url ?? "",
          content: (r.content ?? "").slice(0, 500),
        });
      }
    } else if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
  }

  console.log(`📦 搜索结果: ${allResults.length} 条`);
  console.log(`📝 文本片段: ${textParts.length} 段`);
  if (textParts.length > 0) {
    console.log("───────────────────────────────");
    console.log(textParts.join("\n---\n"));
    console.log("───────────────────────────────\n");
  }

  // 打印所有搜索结果详情（调试用）
  console.log("📋 全部搜索结果:");
  allResults.forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.title}`);
    console.log(`      URL: ${r.url}`);
    if (r.content) {
      console.log(`      内容: ${r.content.slice(0, 200)}...`);
    }
  });
  console.log("");

  return { allResults, textParts, raw: data };
}

// ---------- 步骤 2：基于搜索结果生成 JSON ----------
async function step2GenerateJSON(searchResults) {
  console.log("\n═══════ 步骤 2: 基于搜索结果生成 JSON ═══════\n");

  // 把搜索结果格式化为上下文文本
  const context = searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n内容: ${r.content}`)
    .join("\n\n");

  const systemPrompt = [
    "你是店铺信息提取助手。下面会给你一家店铺的搜索结果，请从中提取信息并以 JSON 格式返回。",
    "JSON 格式：",
    "{",
    '  "coverImageUrl": "图片直链 URL 或 null",',
    '  "storeUrl": "大众点评网店铺详情页 URL 或 null",',
    '  "phone": "电话号码 或 null",',
    '  "address": "完整地址 或 null"',
    "}",
    "",
    "要求：",
    "- storeUrl 只接受 dianping.com 或 dpurl.cn 域名，其他平台返回 null",
    "- coverImageUrl 必须是图片直链（以 http 开头，结尾为 .jpg/.png/.webp 等）",
    "- 搜索结果中没有的字段返回 null，不要编造",
    "- 只输出 JSON，不要输出任何其他内容",
  ].join("\n");

  const userPrompt = [
    `店铺名称：${place.title}`,
    `分类：${place.category}`,
    "",
    "搜索结果：",
    context,
    "",
    "请基于以上搜索结果提取信息，只输出 JSON：",
  ].join("\n");

  const body = {
    model: MODEL,
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    // 不带 tools，纯文本生成
  };

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ HTTP ${res.status} (${elapsed}s)\n`);

  const data = await res.json();
  if (!res.ok) {
    console.error("❌ API 错误:", JSON.stringify(data, null, 2));
    return null;
  }

  const textParts = (data.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text);
  const text = textParts.join("\n\n");

  console.log("📝 模型输出:");
  console.log("───────────────────────────────");
  console.log(text || "(空)");
  console.log("───────────────────────────────\n");

  // 尝试解析 JSON
  if (text) {
    try {
      let jsonStr = text.trim();
      const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) jsonStr = fence[1].trim();
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
      return parsed;
    } catch (e) {
      console.error("❌ JSON 解析失败:", e.message);
    }
  }
  return null;
}

// ---------- 主流程 ----------
async function main() {
  console.log(`🔍 店铺: ${place.title}`);
  console.log(`📡 API: ${BASE_URL}/v1/messages`);
  console.log(`🤖 模型: ${MODEL}\n`);

  try {
    const searchResult = await step1Search();
    if (!searchResult) return;

    if (searchResult.allResults.length === 0) {
      console.log("⚠️ 没有搜索结果，跳过步骤 2");
      return;
    }

    await step2GenerateJSON(searchResult.allResults);
  } catch (e) {
    console.error("❌ 失败:", e.message);
  }
}

main();
