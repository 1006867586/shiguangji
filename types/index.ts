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
  phone?: string | null;
  price?: string | null;
  /** 餐厅分类，如 火锅/烤肉/烧烤/川菜 */
  category?: string | null;
}

/** 用户资料 */
export interface Profile {
  id: UUID;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
}

/** 圈子 */
export interface Group {
  id: UUID;
  name: string;
  description: string | null;
  avatar_url: string | null;
  invite_code: string;
  created_by: UUID;
  created_at: string;
  updated_at?: string;
  settings?: GroupSettings;
  /** 仅在列表接口中附带 */
  member_count?: number;
  role?: MemberRole;
}

/** 圈子设置 */
export interface GroupSettings {
  join_approval?: boolean;
  allow_member_pin?: boolean;
  allow_video?: boolean;
}

/** 圈子成员 */
export interface GroupMember {
  id: UUID;
  group_id: UUID;
  user_id: UUID;
  role: MemberRole;
  joined_at: string;
  profile?: Profile;
}

/** 媒体类型 */
export type MediaKind = "image" | "video";

/** 活动照片 */
export interface ActivityPhoto {
  id: UUID;
  activity_id: UUID;
  uploaded_by: UUID;
  url: string;
  caption: string | null;
  kind: MediaKind;
  /**
   * Live Photo 配对的动态视频 URL。
   * - 普通 image：null
   * - 普通 video：null（视频本身就是动态的）
   * - Live Photo：有值（kind 为 image，url 为静态封面图，此字段为 3 秒动态视频）
   */
  paired_video_url: string | null;
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
  // 扩展字段
  is_pinned?: boolean;
  is_favorited?: boolean;
  tags?: Tag[];
  reactions?: ReactionSummary;
  my_rating?: number | null;
  average_rating?: number | null;
  rating_count?: number;
  rsvp?: { status: RsvpStatus } | null;
  rsvp_summary?: RsvpSummary;
  split?: ActivitySplit | null;
}

/** 标签 */
export interface Tag {
  id: UUID;
  group_id: UUID;
  name: string;
  created_by?: UUID | null;
  created_at: string;
}

/** 反应汇总 */
export interface ReactionSummary {
  like: number;
  love: number;
  haha: number;
  wow: number;
  sad: number;
  angry: number;
  my_reaction?: ReactionEmoji | null;
}

export type ReactionEmoji = "like" | "love" | "haha" | "wow" | "sad" | "angry";

/** RSVP 状态 */
export type RsvpStatus = "attending" | "maybe" | "declined";

export interface RsvpSummary {
  attending: number;
  maybe: number;
  declined: number;
  attendees?: Pick<Profile, "id" | "nickname" | "avatar_url">[];
}

/** AA 账单分摊 */
export interface ActivitySplit {
  id: UUID;
  activity_id: UUID;
  group_id: UUID;
  created_by: UUID;
  title: string;
  total_amount: number; // 单位:分
  currency: string;
  split_mode: "equal" | "custom";
  status: "open" | "settled";
  created_at: string;
  updated_at: string;
  participants?: SplitParticipant[];
}

export interface SplitParticipant {
  id: UUID;
  split_id: UUID;
  user_id: UUID;
  share_amount: number;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
  profile?: Pick<Profile, "id" | "nickname" | "avatar_url">;
}

/** 通知 */
export type NotificationType =
  | "comment"
  | "reply"
  | "like"
  | "repost"
  | "mention"
  | "photo_added"
  | "rsvp"
  | "split"
  | "group_invite"
  | "report_resolved"
  | "system";

export interface AppNotification {
  id: UUID;
  user_id: UUID;
  actor_id: UUID | null;
  type: NotificationType;
  activity_id: UUID | null;
  group_id: UUID | null;
  comment_id: UUID | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  actor?: Pick<Profile, "id" | "nickname" | "avatar_url"> | null;
}

/** 内容举报 */
export type ReportTargetType = "activity" | "comment" | "photo";
export type ReportReason = "spam" | "abuse" | "porn" | "illegal" | "other";
export type ReportStatus = "pending" | "resolved" | "dismissed";

export interface ContentReport {
  id: UUID;
  reporter_id: UUID;
  target_type: ReportTargetType;
  target_id: UUID;
  group_id: UUID;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  resolved_by: UUID | null;
  resolved_at: string | null;
  created_at: string;
  reporter?: Pick<Profile, "id" | "nickname" | "avatar_url">;
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

/** 创建活动请求（含链接解析选项） */
export interface CreateActivityRequest extends CreateActivityBody {
  parseLink?: boolean;
  linkUrl?: string;
}

export interface UpdateActivityBody {
  content?: string;
  externalLink?: ExternalLink | null;
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
  kind?: MediaKind;
  /** Live Photo 配对的动态视频 URL（仅 Live Photo 上传时携带） */
  pairedVideoUrl?: string;
}

export interface CreateCommentBody {
  content: string;
  parentId?: UUID;
}

export interface PresignBody {
  filename: string;
  contentType: string;
  kind?: "image" | "video";
}

// ---- 扩展功能请求体 ----
export interface CreateReactionBody {
  emoji: ReactionEmoji;
}

export interface RateActivityBody {
  score: number; // 1-5
  comment?: string;
}

export interface RsvpBody {
  status: RsvpStatus;
}

export interface CreateSplitBody {
  activityId: UUID;
  groupId: UUID;
  title?: string;
  totalAmount: number; // 分
  splitMode?: "equal" | "custom";
  participantIds: UUID[];
  shares?: Record<UUID, number>; // custom 模式下
}

export interface UpdateSplitParticipantBody {
  paid: boolean;
}

export interface UpdateGroupBody {
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
  settings?: GroupSettings;
}

export interface CreateReportBody {
  targetType: ReportTargetType;
  targetId: UUID;
  groupId: UUID;
  reason: ReportReason;
  detail?: string;
}

export interface ResolveReportBody {
  status: "resolved" | "dismissed";
}

export interface UpdateActivityTagsBody {
  tagNames: string[];
}

export interface SearchActivitiesQuery {
  q: string;
  groupId?: UUID;
  tag?: string;
  limit?: number;
  cursor?: string;
}

// ---- Realtime 事件载荷 ----
export interface RealtimePayload<T = unknown> {
  eventType: "INSERT" | "UPDATE" | "DELETE" | "*";
  new: T;
  old: Partial<T>;
  errors: string[] | null;
}

// ---- AI 解析结果 ----

/** 截图识别结果（小红书/抖音/点评分享截图） */
export interface ParsedScreenshot {
  title: string;
  address: string | null;
  phone: string | null;
  signatureDishes: string[];
  platform: "xiaohongshu" | "douyin" | "dianping" | "unknown";
  summary: string;
  /** 评分，如 4.5；识别不到为 null */
  rating: number | null;
  /** 人均消费，如 "￥80" 或 "80元"；识别不到为 null */
  averagePrice: string | null;
  /** 餐厅分类，如 火锅/烤肉/烧烤/川菜；识别不到为 null */
  category: string | null;
}

/** 账单小票识别结果 */
export interface ParsedReceipt {
  totalAmount: number;
  currency: string;
  items: Array<{ name: string; price: number }>;
  restaurantName: string | null;
  datetime: string | null;
  peopleCount: number | null;
}

/** 收藏夹截图来源平台 */
export type FavoritePlatform =
  | "meituan"
  | "dianping"
  | "xiaohongshu"
  | "douyin"
  | "unknown";

/** 收藏夹截图识别结果（一张图含多家店） */
export interface ParsedFavoritesScreenshot {
  platform: FavoritePlatform;
  places: Array<{
    title: string;
    address: string | null;
    phone: string | null;
    signatureDishes: string[];
    summary: string;
    /** 评分，如 4.5；识别不到为 null */
    rating: number | null;
    /** 人均消费，如 "￥80"；识别不到为 null */
    averagePrice: string | null;
    /** 餐厅分类，如 火锅/烤肉；识别不到为 null */
    category: string | null;
  }>;
}

/** 店铺收藏夹条目 */
export interface FavoritePlace {
  id: UUID;
  user_id: UUID;
  title: string;
  address: string | null;
  phone: string | null;
  signature_dishes: string[];
  platform: FavoritePlatform;
  summary: string;
  source_screenshot_url: string | null;
  created_at: string;
  /** 餐厅分类，如 火锅/烤肉/川菜 */
  category: string | null;
  /** 评分 0-5，保留一位小数 */
  rating: number | null;
  /** 人均消费，如 "￥80" 或 "80元" */
  price: string | null;
  /** 联网搜索补齐的封面图 URL */
  cover_image_url: string | null;
  /** 联网搜索补齐的店铺链接（美团/点评/官网等） */
  store_url: string | null;
}

/** 批量创建店铺收藏请求体 */
export interface CreateFavoritePlacesBody {
  platform?: FavoritePlatform;
  sourceScreenshotUrl?: string;
  places: Array<{
    title: string;
    address?: string | null;
    phone?: string | null;
    signatureDishes?: string[];
    summary?: string;
    rating?: number | null;
    averagePrice?: string | null;
    category?: string | null;
  }>;
}

/** 「今天吃什么」转盘候选项（圈子级共享） */
export interface MealRouletteItem {
  id: UUID;
  group_id: UUID;
  title: string;
  address: string | null;
  phone: string | null;
  signature_dishes: string[];
  added_by: UUID;
  created_at: string;
  /** 关联添加者资料（列表接口附带） */
  adder?: Pick<Profile, "id" | "nickname" | "avatar_url"> | null;
}

/** 新增候选项请求体 */
export interface CreateMealRouletteItemBody {
  title: string;
  address?: string | null;
  phone?: string | null;
  signatureDishes?: string[];
}

/** 批量导入候选项请求体（从收藏夹导入） */
export interface ImportMealRouletteItemsBody {
  items: Array<{
    title: string;
    address?: string | null;
    phone?: string | null;
    signatureDishes?: string[];
  }>;
}
