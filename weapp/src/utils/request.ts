import Taro from "@tarojs/taro";
import { API_BASE_URL, TOKEN_KEY, REFRESH_KEY } from "./config";

/**
 * 请求层封装（Phase 1 核心）
 *
 * 职责：
 * - 统一拼接 API_BASE_URL、JSON 序列化、错误归一化为 ApiError
 * - 自动携带 Authorization: Bearer（小程序通道，服务端 requireUser 已支持）
 * - 401 时用 refreshToken 静默续期一次并重放原请求；
 *   续期也失败则清空本地凭据并跳转登录页
 * - 非 401 错误默认 toast 提示（silent 选项可关闭）
 */

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  data?: Record<string, unknown> | unknown[];
  /** 是否携带 Bearer token，默认 true（登录/刷新接口传 false） */
  auth?: boolean;
  /** 出错时不弹 toast（默认弹） */
  silent?: boolean;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: string;
  code?: string;
}

let refreshing: Promise<boolean> | null = null;

/** 用 refreshToken 换新 token；并发 401 时共享同一次刷新 */
async function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = Taro.getStorageSync<string>(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res = await Taro.request<{
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
      }>({
        url: `${API_BASE_URL}/api/auth/weapp/refresh`,
        method: "POST",
        data: { refreshToken },
        header: { "content-type": "application/json" },
      });
      if (res.statusCode !== 200 || !res.data?.accessToken) return false;
      Taro.setStorageSync(TOKEN_KEY, res.data.accessToken);
      if (res.data.refreshToken) Taro.setStorageSync(REFRESH_KEY, res.data.refreshToken);
      return true;
    } catch {
      return false;
    }
  })();
  const ok = await refreshing;
  refreshing = null;
  return ok;
}

function clearSessionAndGoLogin() {
  Taro.removeStorageSync(TOKEN_KEY);
  Taro.removeStorageSync(REFRESH_KEY);
  Taro.navigateTo({ url: "/pages/login/index" });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", data, auth = true, silent = false } = options;

  const doRequest = () =>
    Taro.request<ApiEnvelope<T> | null>({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      timeout: 15_000,
      header: {
        "content-type": "application/json",
        ...(auth && Taro.getStorageSync<string>(TOKEN_KEY)
          ? { Authorization: `Bearer ${Taro.getStorageSync<string>(TOKEN_KEY)}` }
          : {}),
      },
    });

  let res = await doRequest();

  // 401 → 静默续期一次并重放
  if (res.statusCode === 401 && auth) {
    const ok = await refreshSession();
    if (ok) {
      res = await doRequest();
    } else {
      clearSessionAndGoLogin();
      throw new ApiError("登录已过期，请重新登录", 401, "session_expired");
    }
  }

  if (res.statusCode >= 200 && res.statusCode < 300) {
    // 后端约定：列表接口直接返回数组，其余多为 { data } 或 { error } 包裹
    const body = res.data;
    if (body && typeof body === "object" && !Array.isArray(body) && "data" in body) {
      return (body as ApiEnvelope<T>).data as T;
    }
    return body as T;
  }

  const message =
    (res.data && typeof res.data === "object" && res.data.error) ||
    `请求失败（${res.statusCode}）`;
  const err = new ApiError(String(message), res.statusCode, res.data?.code);
  if (!silent) {
    Taro.showToast({ title: String(message).slice(0, 30), icon: "none", duration: 2200 });
  }
  throw err;
}
