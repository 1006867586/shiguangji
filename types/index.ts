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
  /** POI 匹配补齐的经纬度（GCJ-02，微信 openLocation / 高德同系） */
  location?: { lng: number; lat: number } | null;
}

/** 用户资料 */
export interface Profile {
  id: UUID;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
  /** 已解锁成就（成员列表 / 动态流作者名旁徽章使用，可选） */
  achievements?: Achievement[];
  /** 头像框环色（hex），装扮系统佩戴展示（可选） */
  frameColor?: string | null;
  /** 已佩戴装扮徽章（可选） */
  wornBadges?: WornDecorBadge[];
}

/** 佩戴在昵称旁的装扮徽章（精简字段） */
export interface WornDecorBadge {
  id: UUID;
  icon: string | null;
  color: string | null;
  name: string;
}

/** @提及可点击所需的用户信息（由圈子成员资料构建，供 RichText / 用户卡片使用） */
export interface MentionUser {
  id: UUID;
  nickname: string;
  avatar_url: string | null;
  /** 头像框环色（hex） */
  frameColor?: string | null;
  /** 已佩戴装扮徽章 */
  wornBadges?: WornDecorBadge[];
  /** 已解锁成就 */
  achievements?: Achievement[];
}

/** 积分 / 连续打卡 / 成就汇总 */
export interface UserGamification {
  user_id: UUID;
  points: number;
  streak_count: number;
  last_meal_date: string | null;
  total_meals: number;
  meals_this_week: number;
  circles_joined: number;
  activities_created: number;
  updated_at: string;
}

/** 成就规则类型 */
export type AchievementRuleType =
  | "meals_this_week"
  | "total_meals"
  | "streak"
  | "circles_joined"
  | "activities_created";

/** 成就（含当前用户是否已获得） */
export interface Achievement {
  id: UUID;
  key: string;
  name: string;
  description: string;
  icon: string;
  rule_type: AchievementRuleType;
  threshold: number;
  sort_order: number;
  unlocked?: boolean;
  unlocked_at?: string | null;
}

/** 个人中心游戏化数据 */
export interface GamificationResponse {
  gamification: UserGamification | null;
  achievements: Achievement[];
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
  /** 圈子公告（管理员/创建者可设置；无则未公告） */
  announcement?: string | null;
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
  author?: Pick<
    Profile,
    "id" | "nickname" | "avatar_url" | "frameColor" | "wornBadges"
  >;
  replies?: Comment[];
}

/** 转发的源活动摘要 */
export interface RepostOf {
  id: UUID;
  type: ActivityType;
  content: string | null;
  external_link: ExternalLink | null;
  created_at: string;
  author: Pick<
    Profile,
    "id" | "nickname" | "avatar_url" | "achievements" | "frameColor" | "wornBadges"
  >;
}

/** Feed 卡片 / 活动聚合视图 */
export interface Activity {
  id: UUID;
  type: ActivityType;
  content: string | null;
  external_link: ExternalLink | null;
  created_at: string;
  author: Pick<
    Profile,
    "id" | "nickname" | "avatar_url" | "achievements" | "frameColor" | "wornBadges"
  >;
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
  | "message"
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

/** 邀请链接预览（按邀请码查询的圈子公开信息） */
export interface GroupInvitePreview {
  id: UUID;
  name: string;
  description: string | null;
  avatar_url: string | null;
  /** 圈子成员数 */
  member_count: number;
  /** 当前登录用户是否已是该圈子成员（未登录为 false） */
  is_member: boolean;
}

/** 通过邀请码加入圈子的返回结果 */
export interface JoinGroupResult {
  /** 圈子 id（用于跳转 /g/{id}） */
  id: UUID;
  /** 加入前是否已是成员（true 表示未重复插入） */
  alreadyMember: boolean;
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
  /** 圈子公告（仅管理员/创建者可设置；空字符串代表清除公告） */
  announcement?: string | null;
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
  /** 封面图 URL（AI 不产生，由地图 POI 兜底补全）；未补全时可为空 */
  coverImage?: string | null;
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
  | "amap"
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
  /** 城市（019 迁移新增列，可空；用于打卡搜索限定） */
  city?: string | null;
}

/** 批量创建店铺收藏请求体 */
export interface CreateFavoritePlacesBody {
  platform?: FavoritePlatform;
  sourceScreenshotUrl?: string;
  /** 入库后自动跑地图 POI 匹配，补齐缺失的电话/地址/品类/评分 */
  enrichPoi?: boolean;
  /** 城市名（POI 匹配限定范围用），如 武汉/北京市 */
  city?: string;
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

/** 编辑单条店铺收藏请求体（PATCH，全部字段可选局部更新） */
export interface UpdateFavoritePlaceBody {
  /** 店名（传则必须非空） */
  title?: string;
  address?: string | null;
  phone?: string | null;
  signature_dishes?: string[];
  summary?: string;
  category?: string | null;
  /** 评分 0-5，传 null 清空 */
  rating?: number | null;
  /** 人均消费，如 "￥80" */
  price?: string | null;
  /** 店铺链接（需 http(s):// 开头，传 null 清空） */
  store_url?: string | null;
  platform?: FavoritePlatform;
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

// ============================================================
// 美食打卡地图（places / checkins）
// ============================================================

export type PlaceSource = "amap" | "baidu" | "tencent" | "manual";
export type PlaceStatus = "approved" | "pending_review" | "rejected";

/** 打卡地点主档（对应 public.places，坐标为 GCJ-02） */
export interface MapPlace {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  category: string | null;
  lng: number;
  lat: number;
  source: PlaceSource;
  poi_id: string | null;
  status: PlaceStatus;
  created_at: string;
  /** 当前用户是否已在该地点打过卡（仅列表接口附带） */
  i_checked?: boolean;
  /** 当前用户在该地点最近一条打卡记录 id（撤销打卡用） */
  i_checkin_id?: string | null;
  /** 富文本字段（来自迁移 021，可空） */
  rating?: number | null;
  average_price?: string | null;
  phone?: string | null;
  business_hours?: string | null;
  description?: string | null;
  tags?: string[] | null;
  /** 封面图 URL（来自迁移 022，高德 POI photos[0]） */
  cover_image_url?: string | null;
  updated_at?: string;
}

/** 打卡记录（对应 public.checkins） */
export interface Checkin {
  id: string;
  user_id: string;
  place_id: string;
  activity_id: string | null;
  note: string | null;
  checked_at: string;
  created_at: string;
  place?: MapPlace;
  activity?: {
    id: string;
    group_id: string;
    content: string | null;
  } | null;
}

/** 打卡请求体 */
export interface CreateCheckinBody {
  place: {
    name: string;
    address?: string | null;
    city?: string | null;
    district?: string | null;
    category?: string | null;
    lng: number;
    lat: number;
    source?: PlaceSource;
    poi_id?: string | null;
    /** 富文本字段（来自迁移 021，可选；前端从高德 POI 详情带入） */
    rating?: number | null;
    average_price?: string | null;
    phone?: string | null;
    business_hours?: string | null;
    description?: string | null;
    tags?: string[] | null;
    /** 封面图 URL（迁移 022） */
    cover_image_url?: string | null;
  };
  activity_id?: string | null;
  note?: string | null;
}

/** 打卡结果（upsert place + insert checkin 后返回） */
export interface CreateCheckinResult {
  checkin: Checkin;
  place: MapPlace;
  /** 是否本次新建的地点（false 表示命中已有地点） */
  place_created: boolean;
}

/** 圈子打卡聚合结果（脱敏：无打卡人信息） */
export interface CircleCheckinPlace {
  place_id: string;
  name: string;
  address: string | null;
  category: string | null;
  lng: number;
  lat: number;
  checkin_count: number;
  last_checked_at: string | null;
}

// ============================================================
// 群组聊天（group_messages）
// ============================================================

export type GroupMessageType = "text" | "image";

/** 消息 emoji 回应（一人每个 emoji 一条） */
export interface MessageReaction {
  id: UUID;
  message_id: UUID;
  user_id: UUID;
  emoji: string;
  created_at: string;
}

/**
 * 某条消息的回应聚合视图：按 emoji 归并出「人数 + 本人是否已点」
 */
export interface MessageReactionAggregate {
  emoji: string;
  /** 点过该 emoji 的用户数 */
  count: number;
  /** 当前用户是否已点 */
  reactedByMe: boolean;
}

/** 圈子聊天消息 */
export interface GroupMessage {
  id: UUID;
  group_id: UUID;
  sender_id: UUID;
  type: GroupMessageType;
  content: string | null;
  image_url: string | null;
  /** 引用回复：被引用消息的 ID（无则 null） */
  reply_to_id: UUID | null;
  created_at: string;
  sender?: Pick<
    Profile,
    "id" | "nickname" | "avatar_url" | "frameColor" | "wornBadges"
  > | null;
  /** 被引用消息的发送者（服务端 join 附带） */
  reply_sender?: Pick<Profile, "id" | "nickname"> | null;
  /** 被引用消息的内容预览（文本取 content，图片取固定文案） */
  reply_preview?: string | null;
  /** 该消息的 emoji 回应聚合（服务端附带） */
  reactions?: MessageReactionAggregate[];
  /** 该消息承载的投票/接龙卡片（服务端附带） */
  poll?: GroupPoll | null;
}

/** 发送聊天消息请求体 */
export interface SendMessageBody {
  content?: string;
  imageUrl?: string;
  /** 引用回复：被引用的消息 ID（可选） */
  replyToId?: UUID;
}

/** 聊天消息列表响应 */
export interface ChatMessagesResponse {
  data: GroupMessage[];
  /** 是否还有更早的消息可加载 */
  has_more: boolean;
  /** 加载更早消息用的游标（最早一条消息的 created_at，null 表示没有更多） */
  next_cursor: string | null;
}

// ============================================================
// 群投票 / 接龙（group_polls）
// ============================================================

export type GroupPollKind = "poll" | "rollcall";
export type GroupPollStatus = "open" | "closed";

/** 投票/接龙选项 */
export interface GroupPollOption {
  id: UUID;
  poll_id: UUID;
  label: string;
  sort_order: number;
  /** 该选项得票数（聚合结果附带） */
  count?: number;
  /** 当前用户是否已选（聚合结果附带） */
  votedByMe?: boolean;
}

/** 投票/接龙参与记录（接龙逐人可查） */
export interface GroupPollEntry {
  id: UUID;
  poll_id: UUID;
  user_id: UUID;
  option_id: UUID | null;
  content: string | null;
  created_at: string;
  participant?: Pick<Profile, "id" | "nickname" | "avatar_url"> | null;
}

/** 投票/接龙卡片（内嵌于聊天消息，服务端附带轮询明细） */
export interface GroupPoll {
  id: UUID;
  group_id: UUID;
  created_by: UUID;
  kind: GroupPollKind;
  title: string;
  multiple: boolean;
  status: GroupPollStatus;
  created_at: string;
  closed_at: string | null;
  options: GroupPollOption[];
  /** 当前用户是否参与（rollcall：是否有记录；poll：是否有该 poll 的记录） */
  i_participated: boolean;
  /** 参与人数（poll：投过票的人数；rollcall：接龙条数） */
  participant_count: number;
  rollcall_entries?: GroupPollEntry[];
}

/** 创建投票/接龙请求体 */
export interface CreateGroupPollBody {
  kind: GroupPollKind;
  title: string;
  multiple?: boolean;
  options?: string[];
}

/** 投票/参与请求体 */
export interface VoteGroupPollBody {
  optionId?: UUID;
  /** 单选项切换：真=选中，假=取消；多选取上次值 */
  selected?: boolean;
  /** rollcall 接龙内容（可空） */
  content?: string;
}

// ============================================================
// 装饰装扮系统（decor）
// ============================================================

export type DecorKind = "badge" | "avatar_frame";
export type DecorUnlockType = "shop" | "achievement" | "system";

/** 装饰目录条目 */
export interface DecorItem {
  id: UUID;
  kind: DecorKind;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  /** 样式色（徽章底色 / 头像框环色，hex） */
  color: string | null;
  frame_style: string;
  price: number;
  unlock_type: DecorUnlockType;
  achievement_key: string | null;
  sort_order: number;
  /** 当前用户是否已拥有（目录接口附带） */
  owned?: boolean;
}

/** 当前用户佩戴配置 */
export interface DecorDisplay {
  user_id: UUID;
  avatar_frame_id: UUID | null;
  badge_ids: UUID[];
}

/** 装饰数据响应（我的装扮页） */
export interface DecorResponse {
  items: DecorItem[];
  display: DecorDisplay | null;
  points: number;
}

/** 更新佩戴配置请求体 */
export interface SetDecorDisplayBody {
  avatarFrameId?: UUID | null;
  badgeIds?: UUID[];
}

/** 多个用户的佩戴配置（成员列表展示他人徽章用） */
export interface UserDecorDisplayRow {
  user_id: UUID;
  avatar_frame_id: UUID | null;
  badge_ids: UUID[];
}

/** 购买装饰响应 */
export interface PurchaseDecorResult {
  points: number;
  item_id: UUID;
}

