import type { ApiError } from "@/types";

/** API 调用抛出的业务错误，携带服务端返回的 message 与可选 code。 */
export class ApiCallError extends Error {
  /** 服务端业务错误码（如 INSUFFICIENT_POINTS / DECOR_ALREADY_OWNED） */
  code?: string;
  /** HTTP 状态码 */
  status?: number;

  constructor(message: string, opts?: { code?: string; status?: number }) {
    super(message);
    this.name = "ApiCallError";
    this.code = opts?.code;
    this.status = opts?.status;
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
