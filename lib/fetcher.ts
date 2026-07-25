import type { ApiError } from "@/types";

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
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = (data as ApiError | null)?.error ?? `请求失败 (${res.status})`;
    throw new Error(err);
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
