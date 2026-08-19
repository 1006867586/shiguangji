import { request } from "./request";

/**
 * 业务 API 封装（工具属性版本 · 个人主体可上架）。
 *
 * 去社交化后仅保留与当前功能匹配的接口：
 *   - 资料（GET/PATCH /api/profile）
 *   - 收藏夹（/api/favorite-places，工具属性）
 *   - 转盘分享池（/api/roulette/pool*，免登录工具）
 *
 * 已彻底移除（避免代码包残留被审查）：
 *   - 动态 feed、评论、点赞、转发（/api/feed、/api/activities*、/api/reports）
 *   - 圈子（/api/groups*、/api/notifications*）
 *   - 内容安全检测（/api/weapp/security/msg-sec-check）— 没有 UGC 入口后不再需要
 *   - 小程序码海报（/api/weapp/wxacode）— 活动详情已移除
 *
 * Web 端代码独立（见 AGENTS.md：weapp/ 仅存在于 weapp 分支），不受影响。
 */

// ---- 类型 ----

/** 当前用户资料（GET/PATCH /api/profile） */
export interface ProfileLite {
  id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string | null;
}

/** GET /api/profile — 当前用户资料 */
export function fetchMyProfile(): Promise<ProfileLite> {
  return request<ProfileLite>("/api/profile", { silent: true });
}

/** PATCH /api/profile — 修改昵称/头像 */
export function updateMyProfile(body: {
  nickname?: string;
  avatarUrl?: string | null;
}): Promise<ProfileLite> {
  return request<ProfileLite>("/api/profile", { method: "PATCH", data: body });
}

// ---- 收藏夹（工具属性）----

export type FavoritePlatform =
  | "meituan"
  | "dianping"
  | "xiaohongshu"
  | "douyin"
  | "unknown";

export const PLATFORM_LABELS: Record<FavoritePlatform, string> = {
  meituan: "美团",
  dianping: "大众点评",
  xiaohongshu: "小红书",
  douyin: "抖音",
  unknown: "未知来源",
};

export interface FavoritePlace {
  id: string;
  title: string;
  address: string | null;
  phone: string | null;
  signature_dishes: string[] | null;
  platform: FavoritePlatform;
  summary: string | null;
  source_screenshot_url: string | null;
  created_at: string;
  category: string | null;
  rating: number | null;
  price: string | null;
  cover_image_url: string | null;
  store_url: string | null;
}

/** 智能识别出的店铺（入库前草稿） */
export interface ParsedPlaceDraft {
  title: string;
  address: string | null;
  phone: string | null;
  signatureDishes: string[];
  summary: string;
  rating: number | null;
  averagePrice: string | null;
  category: string | null;
}

/** GET /api/favorite-places — 我的收藏列表 */
export function fetchFavoritePlaces(limit = 200): Promise<FavoritePlace[]> {
  return request<FavoritePlace[]>(`/api/favorite-places?limit=${limit}`, {
    silent: true,
  });
}

/** PATCH /api/favorite-places/[id] — 编辑收藏（白名单字段） */
export function updateFavoritePlace(
  id: string,
  body: Partial<{
    title: string;
    address: string | null;
    phone: string | null;
    signature_dishes: string[];
    rating: number | null;
    price: string | null;
    category: string | null;
    summary: string;
    platform: FavoritePlatform;
  }>
): Promise<FavoritePlace> {
  return request(`/api/favorite-places/${id}`, { method: "PATCH", data: body });
}

/** DELETE /api/favorite-places/[id] */
export function deleteFavoritePlace(id: string): Promise<unknown> {
  return request(`/api/favorite-places/${id}`, { method: "DELETE" });
}

/** POST /api/favorite-places — 批量入库（可选 POI 补齐） */
export function createFavoritePlaces(body: {
  platform: FavoritePlatform;
  sourceScreenshotUrl?: string;
  enrichPoi?: boolean;
  places: Array<{
    title: string;
    address: string | null;
    phone: string | null;
    signatureDishes: string[];
    summary: string;
    rating: number | null;
    averagePrice: string | null;
    category: string | null;
  }>;
}): Promise<FavoritePlace[]> {
  return request("/api/favorite-places", { method: "POST", data: body });
}

/**
 * POST /api/ai/parse-favorites-screenshot — 智能识别收藏夹截图。
 * 后端视觉识别通常 15-30s，timeout 放宽到 60s。
 */
export function parseFavoritesScreenshot(body: {
  imageUrl: string;
  platform?: FavoritePlatform;
}): Promise<{ platform: FavoritePlatform; places: ParsedPlaceDraft[] }> {
  return request("/api/ai/parse-favorites-screenshot", {
    method: "POST",
    data: body,
    timeout: 60_000,
  });
}

// ---- 今天吃什么转盘（分享池 · 免登录）----

/** 静态默认菜系条目形态（不绑定圈子） */
export interface MealRouletteItem {
  id: string;
  title: string;
  address: string | null;
  phone: string | null;
}

export interface RoulettePool {
  id: string;
  code: string;
  name: string | null;
  created_at: string;
}

export interface RoulettePoolItem {
  id: string;
  title: string;
  address: string | null;
  phone: string | null;
  created_by: string;
  created_at: string;
}

/** POST /api/roulette/pools — 创建分享池（免登录） */
export function createRoulettePool(name?: string): Promise<RoulettePool> {
  return request(`/api/roulette/pools`, {
    method: "POST",
    data: name ? { name } : {},
    auth: false,
    silent: true,
  });
}

/** GET /api/roulette/pool?code= — 分享池信息 + 候选列表（免登录） */
export function fetchRoulettePool(
  code: string
): Promise<{ pool: RoulettePool; items: RoulettePoolItem[] }> {
  return request(
    `/api/roulette/pool?code=${encodeURIComponent(code)}`,
    { auth: false, silent: true }
  );
}

/** POST /api/roulette/pool — 添加候选（免登录，createdBy=设备匿名 ID） */
export function addRoulettePoolItem(
  code: string,
  body: { title: string; address?: string; phone?: string; createdBy: string }
): Promise<RoulettePoolItem> {
  return request(`/api/roulette/pool`, {
    method: "POST",
    data: { code, ...body },
    auth: false,
  });
}

/** DELETE /api/roulette/pool/items/[id]?createdBy= — 删除候选（仅自己添加的） */
export function deleteRoulettePoolItem(itemId: string, createdBy: string): Promise<unknown> {
  return request(
    `/api/roulette/pool/items/${itemId}?createdBy=${encodeURIComponent(createdBy)}`,
    { method: "DELETE", auth: false }
  );
}
