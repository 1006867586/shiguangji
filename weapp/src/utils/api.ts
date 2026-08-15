import { request } from "./request";

/**
 * 业务 API 封装（M2 核心闭环）。
 * 类型为后端返回字段的子集，只声明小程序端用到的部分。
 */

// ---- 类型 ----

export interface GroupLite {
  id: string;
  name: string;
  invite_code?: string;
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
