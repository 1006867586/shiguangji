import type { ApiError } from "@/types";

/** API 调用抛出的业务错误，携带服务端返回的 message 与可选 code。 */
export class ApiCallError extends Error {
  /** 服务端业务错误码（如 INSUFFICIENT_POINTS / DECOR_ALREADY_OWNED） */
  code?: string;
  /** HTTP 状态码 */
  status?: number;
  /** 服务端返回的 debug_message（生产环境透传 RPC 原始 message） */
  debugMessage?: string;
  /** 服务端返回的 details（Postgres details 字段） */
  details?: unknown;
  /** 服务端返回的 hint（Postgres hint 字段） */
  hint?: string;

  constructor(
    message: string,
    opts?: {
      code?: string;
      status?: number;
      debugMessage?: string;
      details?: unknown;
      hint?: string;
    }
  ) {
    super(message);
    this.name = "ApiCallError";
    this.code = opts?.code;
    this.status = opts?.status;
    this.debugMessage = opts?.debugMessage;
    this.details = opts?.details;
    this.hint = opts?.hint;
  }
}

/** 统一的客户端 fetch 封装，自动处理 JSON 与错误。 */
export async function fetcher<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // 非 JSON 响应（如 502 HTML 错误页），抛出友好错误而非 SyntaxError
      throw new ApiCallError(`请求失败 (${res.status})`, { status: res.status });
    }
  }

  if (!res.ok) {
    const payload = data as ApiError | null;
    const message = payload?.error ?? `请求失败 (${res.status})`;
    throw new ApiCallError(message, {
      code: payload?.code,
      status: res.status,
      debugMessage: (payload as { debug_message?: string } | null)
        ?.debug_message,
      details: (payload as { details?: unknown } | null)?.details,
      hint: (payload as { hint?: string } | null)?.hint,
    });
  }

  return data as T;
}

/** 针对包装在 `data` 字段里的响应，直接返回 data 字段。 */
export async function fetchData<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const wrapped = await fetcher<{ data: T }>(input, init);
  return wrapped.data;
}
