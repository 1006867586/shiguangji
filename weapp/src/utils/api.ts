import { request } from "./request";

/**
 * 业务 API 封装（M2 核心闭环）。
 * 类型为后端返回字段的子集，只声明小程序端用到的部分。
 */
// ---- 类型 ----

export interface GroupLite {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  invite_code?: string;
  role?: "admin" | "member";
}

export interface ExternalLinkLite {
  platform: string;
  url: string;
  title: string;
  coverImage?: string | null;
  rating?: number | null;
  address?: string | null;
  phone?: string | null;
  price?: string | null;
  category?: string | null;
}

export interface ActivityPhotoLite {
  id: string;
  url: string;
  caption?: string | null;
  kind?: string;
}

export interface ActivityLite {
  id: string;
  type: "original" | "repost";
  content: string | null;
  external_link: ExternalLinkLite | null;
  created_at: string;
  author: { id: string; nickname: string; avatar_url: string | null };
  photos: ActivityPhotoLite[];
  photo_count: number;
  comment_count: number;
  like_count: number;
  is_liked: boolean;
  repost_of: {
    id: string;
    content: string | null;
    external_link: ExternalLinkLite | null;
    author: { id: string; nickname: string };
  } | null;
  repost_comment?: string | null;
  group_id: string;
}

export interface CommentLite {
  id: string;
  activity_id: string;
  author_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  author: { id: string; nickname: string; avatar_url: string | null };
  replies?: CommentLite[];
}

export interface LinkPreviewResult {
  platform: string;
  url: string;
  title: string;
  coverImage: string | null;
  rating: number | null;
  address: string | null;
  phone: string | null;
  price: string | null;
  category?: string | null;
}

// ---- Feed ----

/** GET /api/feed?groupId=&cursor=&limit= （raw 模式读取 next_cursor） */
export async function fetchFeed(opts: {
  groupId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{ data: ActivityLite[]; next_cursor: string | null }> {
  const params = new URLSearchParams({ groupId: opts.groupId, limit: String(opts.limit ?? 20) });
  if (opts.cursor) params.set("cursor", opts.cursor);
  return request<{ data: ActivityLite[]; next_cursor: string | null }>(
    `/api/feed?${params.toString()}`,
    { raw: true, silent: true }
  );
}

/** GET /api/activities/[id] — 活动详情 */
export function fetchActivityDetail(id: string): Promise<ActivityLite> {
  return request<ActivityLite>(`/api/activities/${id}`, { silent: true });
}

/** POST /api/activities/[id]/like — 点赞 / 取消（toggle） */
export function toggleLike(id: string): Promise<{ liked: boolean; like_count: number }> {
  return request(`/api/activities/${id}/like`, { method: "POST" });
}

// ---- 评论 ----

export function fetchComments(activityId: string): Promise<CommentLite[]> {
  return request<CommentLite[]>(`/api/activities/${activityId}/comments`, { silent: true });
}

export function postComment(activityId: string, content: string, parentId?: string): Promise<CommentLite> {
  return request(`/api/activities/${activityId}/comments`, {
    method: "POST",
    data: parentId ? { content, parentId } : { content },
  });
}

// ---- 圈子 ----

export function fetchGroups(): Promise<GroupLite[]> {
  return request<GroupLite[]>("/api/groups", { silent: true });
}

/** POST /api/groups — 创建圈子 */
export function createGroup(body: {
  name: string;
  description?: string;
}): Promise<GroupLite> {
  return request("/api/groups", { method: "POST", data: body });
}

/** POST /api/groups/join — 邀请码加入圈子 */
export function joinGroup(inviteCode: string): Promise<GroupLite> {
  return request("/api/groups/join", {
    method: "POST",
    data: { inviteCode },
  });
}

export interface GroupMemberLite {
  id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  profile?: { id: string; nickname: string; avatar_url: string | null } | null;
}

/** GET /api/groups/[id]/members — 成员列表 */
export function fetchGroupMembers(groupId: string): Promise<GroupMemberLite[]> {
  return request<GroupMemberLite[]>(`/api/groups/${groupId}/members`, {
    silent: true,
  });
}

// ---- 通知 ----

export interface NotificationLite {
  id: string;
  type: string;
  activity_id: string | null;
  group_id: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  actor?: { id: string; nickname: string; avatar_url: string | null } | null;
}

/** GET /api/notifications?cursor=&limit= （raw 读取 next_cursor） */
export async function fetchNotifications(opts: {
  cursor?: string | null;
  limit?: number;
}): Promise<{ data: NotificationLite[]; next_cursor: string | null }> {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 30) });
  if (opts.cursor) params.set("cursor", opts.cursor);
  return request<{ data: NotificationLite[]; next_cursor: string | null }>(
    `/api/notifications?${params.toString()}`,
    { raw: true, silent: true }
  );
}

/** GET /api/notifications/unread-count */
export function fetchUnreadCount(): Promise<{ count: number }> {
  return request<{ count: number }>("/api/notifications/unread-count", {
    silent: true,
  });
}

/** POST /api/notifications/[id]/read */
export function markNotificationRead(id: string): Promise<unknown> {
  return request(`/api/notifications/${id}/read`, { method: "POST", silent: true });
}

/** POST /api/notifications/read-all */
export function markAllNotificationsRead(): Promise<unknown> {
  return request("/api/notifications/read-all", { method: "POST", silent: true });
}

// ---- 发布 ----

/** POST /api/link-preview — 解析分享文本 / 链接 */
export function parseLink(url: string): Promise<LinkPreviewResult> {
  return request<LinkPreviewResult>("/api/link-preview", {
    method: "POST",
    data: { url },
    silent: true,
  });
}

/** POST /api/activities — 创建活动（原创） */
export function createActivity(body: {
  groupId: string;
  content?: string;
  externalLink?: ExternalLinkLite;
}): Promise<{ id: string }> {
  return request("/api/activities", { method: "POST", data: body });
}

/** POST /api/activities/[id]/photos — 追加照片（R2 直传拿到 publicUrl 后调用） */
export function addActivityPhoto(
  activityId: string,
  url: string,
  kind: "image" | "video" = "image"
): Promise<unknown> {
  return request(`/api/activities/${activityId}/photos`, {
    method: "POST",
    data: { url, kind },
  });
}

// ---- 收藏夹（M3）----

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

/** AI 识别出的店铺（入库前草稿） */
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
 * POST /api/ai/parse-favorites-screenshot — AI 识别收藏夹截图。
 * 后端 MiniMax-M3 视觉识别通常 15-30s，timeout 放宽到 60s。
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
