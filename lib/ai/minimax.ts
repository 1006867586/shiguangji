/**
 * MiniMax AI 客户端封装
 *
 * 文档: https://platform.minimaxi.com/docs/api-reference/text-openai-api
 *
 * 支持:
 * - 文本对话（含多模态视觉理解）
 * - OpenAI 兼容接口（/v1/chat/completions）
 *
 * 环境变量:
 * - MINIMAX_API_KEY: 必填，API Key
 * - MINIMAX_BASE_URL: 可选，默认 https://api.minimaxi.com/v1
 * - MINIMAX_MODEL: 可选，默认 MiniMax-M2.5-highspeed（性价比高，速度优先）
 * - MINIMAX_VISION_MODEL: 可选，多模态默认 MiniMax-M3
 */

const DEFAULT_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MODEL = "MiniMax-M2.5-highspeed";
const DEFAULT_VISION_MODEL = "MiniMax-M3";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
}

export interface ChatOptions {
  /** 模型覆盖 */
  model?: string;
  /** 温度 0-1，默认 0.8 */
  temperature?: number;
  /** 最大输出 token */
  maxTokens?: number;
  /** 超时毫秒，默认 60s（视觉任务可适当调高） */
  timeoutMs?: number;
  /**
   * MiniMax-M3 thinking 控制。
   * - "disabled": 关闭思考，输出更干净，token 消耗更少（适合结构化提取）
   * - "adaptive": 由模型自行决定是否思考
   * 不传则不发送该字段，由模型使用默认行为。
   * 注意：API 仅接受 disabled / adaptive，传 "enabled" 会返回 400。
   */
  thinking?: "disabled" | "adaptive";
}

export interface ChatResult {
  content: string;
  /** 本次消耗的 token 数（如 API 返回） */
  totalTokens?: number;
  model: string;
}

class MiniMaxError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "MiniMaxError";
  }
}

function getConfig() {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new MiniMaxError(
      "未配置 MINIMAX_API_KEY，请在环境变量中设置后重启服务",
      500
    );
  }
  return {
    apiKey,
    baseUrl: process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.MINIMAX_MODEL || DEFAULT_MODEL,
    visionModel: process.env.MINIMAX_VISION_MODEL || DEFAULT_VISION_MODEL,
  };
}

/**
 * 调用 MiniMax 对话接口（OpenAI 兼容）
 * 支持纯文本与多模态（image_url）消息
 */
export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<ChatResult> {
  const cfg = getConfig();
  const model = opts.model ?? cfg.model;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 1024,
    };
    if (opts.thinking) {
      body.thinking = { type: opts.thinking };
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      // 401 通常是 API Key 无效或与 Base URL 不匹配
      if (res.status === 401) {
        // 附带 key 长度与前 6 位（不泄露完整 key），便于排查环境变量是否被截断/带引号/占位符
        const keyLen = cfg.apiKey.length;
        const keyPrefix = cfg.apiKey.slice(0, 6);
        const keySuffix = cfg.apiKey.slice(-4);
        throw new MiniMaxError(
          `MiniMax 鉴权失败 (401): baseUrl=${cfg.baseUrl}, apiKey长度=${keyLen}, apiKey前后缀=${keyPrefix}***${keySuffix}。` +
            `若长度异常或前缀不是 sk-cp-，请检查 Vercel 环境变量 MINIMAX_API_KEY 是否完整粘贴（无引号/空格/换行）。` +
            `原始返回: ${errText.slice(0, 200)}`,
          res.status
        );
      }
      throw new MiniMaxError(
        `MiniMax API 调用失败 (${res.status}): ${errText.slice(0, 200)}`,
        res.status
      );
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw new MiniMaxError("MiniMax 返回空内容", 500);
    }
    return {
      content,
      totalTokens: data?.usage?.total_tokens,
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 多模态视觉理解：传入图片 URL 与文字提示，返回文字描述
 *
 * 视觉任务（截图识别/账单识别）需要的是结构化 JSON 输出，不需要推理过程，
 * 默认 thinking: "disabled" 以节省 token、避免思考吃满 max_tokens 导致空内容。
 */
export async function vision(
  imageUrl: string,
  prompt: string,
  opts: Omit<ChatOptions, "model"> = {}
): Promise<ChatResult> {
  const cfg = getConfig();
  return chat(
    [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    {
      ...opts,
      thinking: opts.thinking ?? "disabled",
      model: cfg.visionModel,
      // 留 10s 余量给 Vercel 函数返回响应，避免被 maxDuration 硬杀导致前端 "failed to fetch"
      timeoutMs: opts.timeoutMs ?? 50_000,
    }
  );
}

/**
 * 解析 JSON 输出：很多场景需要 AI 返回结构化数据
 * 容忍模型输出 ```json ... ``` 包裹
 */
export function parseJsonContent<T = unknown>(content: string): T {
  let text = content.trim();
  // 去除 markdown 代码块包裹
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  // 去除首尾可能的多余文本
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text) as T;
}

/**
 * 是否配置了 MiniMax（用于前端按钮显隐判断）
 * 注意：此函数只能在服务端调用
 */
export function isAiConfigured(): boolean {
  return Boolean(process.env.MINIMAX_API_KEY);
}

export { MiniMaxError };
