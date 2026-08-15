/**
 * 环境配置。
 *
 * API 基址解析优先级：
 * 1. process.env.TARO_APP_API_BASE —— 本地 .env 文件 / CI 注入
 *    （Taro 4 约定：构建期只注入 TARO_APP_ 前缀的环境变量）
 * 2. 兜底 http://localhost:3000 —— 本地 Next.js dev server，
 *    需在微信开发者工具「详情 → 本地设置」勾选「不校验合法域名」
 *
 * 生产环境上线前：改为已备案的 HTTPS 域名，并在小程序后台
 * 「开发管理 → 开发设置 → 服务器域名 → request 合法域名」中登记。
 */
export const API_BASE_URL: string =
  process.env.TARO_APP_API_BASE || "http://localhost:3000";

/** 本地凭据存储 key（与 Web 端 cookie 无关，仅小程序本地） */
export const TOKEN_KEY = "xk_access_token";
export const REFRESH_KEY = "xk_refresh_token";
export const EXPIRES_KEY = "xk_expires_at";
