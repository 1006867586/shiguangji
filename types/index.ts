// ============================================================
// 飨刻 - 全局 TypeScript 类型定义
// ============================================================

export type UUID = string;

export type ActivityType = "original" | "repost";
export type MemberRole = "admin" | "member";

export type ExternalPlatform = "dianping" | "meituan" | "other";

/** 外部链接信息（美团/点评等） */
export interface ExternalLink {
  platform: ExternalPlatform;
  url: string;
  title: string;
  coverImage?: string | null;
  rating?: number | null;
  address?: string | null;
  price?: string | null;
}

/** 用户资料 */
export interface Profile {
  id: UUID;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
}

/** 团体 */
export interface Group {
  id: UUID;
  name: string;
  description: string | null;
  avatar_url: string | null;
  invite_code: string;
  created_by: UUID;
  created_at: string;
  /** 仅在列表接口中附带 */
  member_count?: number;
  role?: MemberRole;
}

/** 团体成员 */
export interface GroupMember {
  id: UUID;
  group_id: UUID;
  user_id: UUID;
  role: MemberRole;
  joined_at: string;
  profile?: Profile;
}

/** 活动照片 */
export interface ActivityPhoto {
  id: UUID;
  activity_id: UUID;
  uploaded_by: UUID;
  url: string;
  caption: string | null;
  created_at: string;
  uploader?: Pick<Profile, "id" | "nickname" | "avatar_url">;
}

/** 评论 */
export interface Comment {
  id: UUID;
  activity_id: UUID;
  author_id: UUID;
  content: string;
  parent_id: UUID | null;
  created_at: string;
  author?: Pick<Profile, "id" | "nickname" | "avatar_url">;
  replies?: Comment[];
}

/** 转发的源活动摘要 */
export interface RepostOf {
  id: UUID;
  type: ActivityType;
  content: string | null;
  external_link: ExternalLink | null;
  created_at: string;
  author: Pick<Profile, "id" | "nickname" | "avatar_url">;
}

/** Feed 卡片 / 活动聚合视图 */
export interface Activity {
  id: UUID;
  type: ActivityType;
  content: string | null;
  external_link: ExternalLink | null;
  created_at: string;
  author: Pick<Profile, "id" | "nickname" | "avatar_url">;
  photos: ActivityPhoto[];
  photo_count: number;
  comment_count: number;
  like_count: number;
  is_liked: boolean;
  repost_of: RepostOf | null;
  repost_comment?: string | null;
  group_id: UUID;
}

/** Feed 分页响应 */
export interface FeedResponse {
  data: Activity[];
  next_cursor: string | null;
}

/** API 统一错误响应 */
export interface ApiError {
  error: string;
  code?: string;
}

/** 预签名上传响应 */
export interface PresignResponse {
  presignedUrl: string;
  publicUrl: string;
  key: string;
}

// ---- 请求体类型 ----
export interface CreateActivityBody {
  groupId: UUID;
  content?: string;
  externalLink?: ExternalLink;
  repostOfId?: UUID;
  repostComment?: string;
}

export interface CreateGroupBody {
  name: string;
  description?: string;
  avatarUrl?: string;
}

export interface JoinGroupBody {
  inviteCode: string;
}

export interface AddPhotoBody {
  url: string;
  caption?: string;
}

export interface CreateCommentBody {
  content: string;
  parentId?: UUID;
}

export interface PresignBody {
  filename: string;
  contentType: string;
}

// ---- Realtime 事件载荷 ----
export interface RealtimePayload<T = unknown> {
  eventType: "INSERT" | "UPDATE" | "DELETE" | "*";
  new: T;
  old: Partial<T>;
  errors: string[] | null;
}
