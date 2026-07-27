/**
 * MiniMax Anthropic Messages API 客户端
 *
 * 文档: https://platform.minimaxi.com/docs/guides/server-tools
 *
 * 用途:
 * - 调用 web_search 服务端工具（联网搜索）补齐店铺信息
 * - 与 OpenAI 兼容接口（/v1/chat/completions）共存，使用独立的 Base URL
 *
 * 环境变量:
 * - MINIMAX_API_KEY: 必填，与 OpenAI 接口共用
 * - MINIMAX_ANTHROPIC_BASE_URL: 可选，默认 https://api.minimaxi.com/anthropic
 *   注意：Anthropic 端点路径为 /v1/messages，与 OpenAI 接口的 /v1/chat/completions 不同
 * - MINIMAX_ANTHROPIC_MODEL: 可选，默认 MiniMax-M3（M3 支持 web_search 服务端工具）
 */

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.minimaxi.com/anthropic";
const DEFAULT_ANTHROPIC_MODEL = "MiniMax-M3";
const ANTHROPIC_VERSION = "2023-06-01";

/** web_search 服务端工具版本化类型标识（沿用 Anthropic 官方命名） */
const WEB_SEARCH_TOOL_TYPE = "web_search_20250305";

export interface AnthropicMessage {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "url"; url: string } }
      >;
}

export interface AnthropicChatOptions {
  /** 模型覆盖 */
  model?: string;
  /** System 提示（Anthropic 风格，独立于 messages） */
  system?: string;
  /** 最大输出 token */
  maxTokens?: number;
  /** 温度，默认 1 */
  temperature?: number;
  /** 是否启用 web_search 服务端工具，默认 false */
  enableWebSearch?: boolean;
  /**
   * thinking 控制：
   * - "disabled": 关闭思考（适合结构化提取，token 消耗少）
   * - "adaptive": 由模型自行决定
   * 不传则由模型使用默认行为（M3 默认会思考，可能消耗大量 token）
   * 注意：web_search 场景建议关闭 thinking，避免思考吃满 max_tokens 导致空内容
   */
  thinking?: "disabled" | "adaptive";
  /** 超时毫秒，默认 90s（联网搜索耗时较长） */
  timeoutMs?: number;
  /**
   * 是否允许空文本返回（默认 false）。
   * web_search 场景下 M3 可能"搜完即止"不生成最终 text，
   * 此时若设为 true，则不会抛错，调用方可直接读取 searchResults。
   * 适用于两步式调用的步骤1（只收集搜索结果）。
   */
  allowEmptyText?: boolean;
}

export interface AnthropicChatResult {
  /** 拼接后的纯文本内容（所有 text 块合并） */
  content: string;
  /** 模型名称 */
  model: string;
  /** 停止原因 */
  stopReason?: string;
  /** token 用量 */
  inputTokens?: number;
  outputTokens?: number;
  /** 服务端搜索结果（含原始 url/title/content，便于提取封面图等） */
  searchResults: Array<{
    title: string;
    url: string;
    content?: string;
  }>;
}

class MiniMaxAnthropicError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = "MiniMaxAnthropicError";
  }
}

function getConfig() {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new MiniMaxAnthropicError(
      "未配置 MINIMAX_API_KEY，请在环境变量中设置后重启服务",
      500
    );
  }
  return {
    apiKey,
    baseUrl:
      process.env.MINIMAX_ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL,
    model: process.env.MINIMAX_ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
  };
}

/**
 * 调用 Anthropic Messages API（MiniMax 兼容）
 * 支持纯文本对话与 web_search 服务端工具
 */
export async function chat(
  messages: AnthropicMessage[],
  opts: AnthropicChatOptions = {}
): Promise<AnthropicChatResult> {
  const cfg = getConfig();
  const model = opts.model ?? cfg.model;
  const timeoutMs = opts.timeoutMs ?? 90_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 1,
    };
    if (opts.system) {
      body.system = opts.system;
    }
    if (opts.thinking) {
      body.thinking = { type: opts.thinking };
    }
    if (opts.enableWebSearch) {
      body.tools = [
        { type: WEB_SEARCH_TOOL_TYPE, name: "web_search" },
      ];
    }

    const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // MiniMax Anthropic 端点兼容 Authorization: Bearer 与 x-api-key 两种鉴权方式，
        // 二者取一即可（同时携带时 Authorization 优先）。统一用 Bearer 与 OpenAI 接口保持一致。
        Authorization: `Bearer ${cfg.apiKey}`,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new MiniMaxAnthropicError(
          `MiniMax (Anthropic) 鉴权失败 (401): baseUrl=${cfg.baseUrl}, 原始返回: ${errText.slice(0, 200)}`,
          res.status
        );
      }
      throw new MiniMaxAnthropicError(
        `MiniMax (Anthropic) API 调用失败 (${res.status}): ${errText.slice(0, 300)}`,
        res.status
      );
    }

    const data = await res.json();
    const contentBlocks: Array<Record<string, unknown>> = Array.isArray(
      data?.content
    )
      ? data.content
      : [];

    // 合并所有 text 块为纯文本
    const textParts: string[] = [];
    const searchResults: Array<{ title: string; url: string; content?: string }> = [];
    for (const block of contentBlocks) {
      if (block.type === "text" && typeof block.text === "string") {
        textParts.push(block.text);
      } else if (block.type === "web_search_tool_result") {
        const results = Array.isArray(block.content) ? block.content : [];
        for (const r of results) {
          if (r && r.type === "web_search_result" && typeof r.url === "string") {
            searchResults.push({
              title: typeof r.title === "string" ? r.title : "",
              url: r.url,
              content: typeof r.content === "string" ? r.content : undefined,
            });
          }
        }
      }
    }

    const content = textParts.join("\n\n");
    if (!content && !opts.allowEmptyText) {
      // 诊断信息：列出 content 块的类型，便于排查为何没有 text 块
      const blockTypes = contentBlocks.map((b) => String(b?.type ?? "?")).join(", ");
      const stopReason = typeof data?.stop_reason === "string" ? data.stop_reason : "?";
      throw new MiniMaxAnthropicError(
        `MiniMax (Anthropic) 返回空内容 (stop_reason=${stopReason}, blocks=[${blockTypes}])。` +
          `可能原因：max_tokens 过小被 thinking 占满，或模型未生成最终回复。` +
          `若仅需搜索结果，可设置 allowEmptyText: true。`,
        500
      );
    }

    return {
      content,
      model,
      stopReason: typeof data?.stop_reason === "string" ? data.stop_reason : undefined,
      inputTokens: data?.usage?.input_tokens,
      outputTokens: data?.usage?.output_tokens,
      searchResults,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析 JSON 输出：容忍模型输出 ```json ... ``` 包裹，或前后带引导语
 * 联网搜索场景下 M3 可能先说"我来帮你搜索..."再给出 JSON，
 * 这里从文本中提取最后一个完整的 {...} 块作为候选。
 */
export function parseJsonContent<T = unknown>(content: string): T {
  let text = content.trim();
  // 1. 优先匹配 ```json ... ``` 代码块
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  // 2. 提取最后一个 {...} 块（贪婪到末尾）
  //    使用平衡花括号扫描，避免嵌套对象被截断
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace > 0) {
    // 从最后一个 } 向前找匹配的 {
    let depth = 0;
    let startIdx = -1;
    for (let i = lastBrace; i >= 0; i--) {
      const ch = text[i];
      if (ch === "}") depth++;
      else if (ch === "{") {
        depth--;
        if (depth === 0) {
          startIdx = i;
          break;
        }
      }
    }
    if (startIdx >= 0) {
      text = text.slice(startIdx, lastBrace + 1);
    }
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

export { MiniMaxAnthropicError };
