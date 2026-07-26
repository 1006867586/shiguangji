/** 应用常量 */

export const APP_NAME = "飨刻";
export const APP_NAME_EN = "XiangKe";

/** Feed 分页默认条数 */
export const DEFAULT_PAGE_SIZE = 20;

/** 照片网格最大展示数 */
export const PHOTO_GRID_MAX = 9;

/** 邀请码长度 */
export const INVITE_CODE_LENGTH = 6;

/** 单张图片压缩后最大体积（字节） */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB

/** 单个视频最大体积（字节） */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

/** 预签名 URL 有效期（秒） */
export const PRESIGN_EXPIRY_SECONDS = 300; // 5 分钟

/** 评论区单次加载条数 */
export const COMMENT_PAGE_SIZE = 50;

/** 本地存储键 */
export const STORAGE_KEYS = {
  lastGroupId: "xiangke:lastGroupId",
} as const;
