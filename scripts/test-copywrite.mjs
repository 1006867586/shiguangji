/**
 * 本地测试：AI 文案生成接口
 * 复现"发起活动时 ai 生成文案失败"的问题
 *
 * 用法：node scripts/test-copywrite.mjs [店名]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1";
const MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.5-highspeed";

if (!API_KEY) {
  console.error("❌ 未配置 MINIMAX_API_KEY");
  process.exit(1);
}

const title = process.argv[2] || "海底捞·武汉广场店";
const style = "casual";

const SYSTEM_PROMPT =
  "你是飨刻 app 的文案助手，帮用户写聚餐活动邀请文案，要简短有感染力，50-150字。";

const prompt = [
  "请为以下聚餐活动生成 3 个邀请文案候选：",
  "",
  `店名：${title}`,
  `文案风格：${style}（随意轻松、像朋友间的口吻）`,
  "",
  "要求：",
  "- 每个文案 50-150 字",
  `- 风格必须符合「随意轻松、像朋友间的口吻」`,
  "- 简短有感染力，适合在飨刻 app 的圈子 feed 中发布",
  "- 不要包含 emoji 以外的特殊符号",
  "",
  "请严格按以下 JSON 格式返回，不要包含任何额外文本或 markdown 代码块：",
  "{",
  '  "copies": ["文案1", "文案2", "文案3"]',
  "}",
].join("\n");

async function testDisabled() {
  console.log("═══════ 测试1: thinking: disabled (当前线上配置) ═══════\n");
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 2048,
    thinking: { type: "disabled" },
  };
  await callApi(body);
}

async function testAdaptive() {
  console.log("\n═══════ 测试2: thinking: adaptive ═══════\n");
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
  };
  await callApi(body);
}

async function testNoThinking() {
  console.log("\n═══════ 测试3: 不传 thinking (模型默认行为) ═══════\n");
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    max_tokens: 2048,
  };
  await callApi(body);
}

async function callApi(body) {
  console.log(`📡 POST ${BASE_URL}/chat/completions`);
  console.log(`🤖 模型: ${body.model}`);
  console.log(`⚙️ thinking: ${JSON.stringify(body.thinking ?? "(未传)")}\n`);

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
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
      console.error("❌ API 错误:", JSON.stringify(data, null, 2));
      return;
    }

    const content = data?.choices?.[0]?.message?.content ?? "";
    const finishReason = data?.choices?.[0]?.finish_reason;
    console.log(`finish_reason: ${finishReason}`);
    console.log(`tokens: input=${data?.usage?.prompt_tokens}, output=${data?.usage?.completion_tokens}, total=${data?.usage?.total_tokens}`);
    console.log(`content 长度: ${content.length}`);

    if (!content) {
      console.error("❌ 空内容！");
      console.log("完整响应:", JSON.stringify(data, null, 2).slice(0, 1000));
      return;
    }

    console.log("\n📝 模型输出:");
    console.log("───────────────────────────────");
    console.log(content.slice(0, 800));
    if (content.length > 800) console.log(`... (共 ${content.length} 字符)`);
    console.log("───────────────────────────────\n");

    // 尝试解析 JSON
    try {
      let text = content.trim();
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) text = fence[1].trim();
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first >= 0 && last > first) text = text.slice(first, last + 1);
      const parsed = JSON.parse(text);
      console.log("✅ JSON 解析成功:", JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error("❌ JSON 解析失败:", e.message);
    }
  } catch (e) {
    clearTimeout(timer);
    console.error("❌ 请求失败:", e.message);
  }
}

async function main() {
  console.log(`🔍 店名: ${title}`);
  console.log(`📡 API: ${BASE_URL}/chat/completions`);
  console.log(`🤖 模型: ${MODEL}\n`);

  await testDisabled();
  await testAdaptive();
  await testNoThinking();
}

main();
