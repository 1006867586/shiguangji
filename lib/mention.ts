// ============================================================
// @提及（mention）解析
// 用于活动 / 评论正文中识别 @昵称 并触发通知。
// ============================================================

/** 团体成员的最小结构，用于昵称匹配 */
export interface MentionMember {
  user_id: string;
  profile?: {
    nickname: string;
  } | null;
}

/** 昵称最大长度（中文 / 英文 / 数字 / 下划线，1-30 字符） */
const MAX_NICKNAME_LENGTH = 30;

/**
 * 解析 @昵称 的正则。
 * 匹配 @ 后到首个空白符或常见中英文标点为止的连续字符。
 */
const MENTION_REGEX = /@([^\s@，。！？、,.!?<>]+)/g;

/**
 * 从文本中解析所有 @提及的昵称。
 * 支持中文、英文、数字、下划线，长度 1-30 字符。
 *
 * @returns 去重后的昵称数组（保留原始大小写）
 */
export function parseMentions(content: string): string[] {
  if (!content || typeof content !== "string") return [];

  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  // 重置 lastIndex 避免同一正则实例被多次复用导致的状态残留
  MENTION_REGEX.lastIndex = 0;
  while ((m = MENTION_REGEX.exec(content)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    // 进一步过滤：仅保留 1-30 字符的合法昵称片段
    const name = raw.trim();
    if (!name) continue;
    if (name.length > MAX_NICKNAME_LENGTH) continue;
    matches.add(name);
  }
  return Array.from(matches);
}

/**
 * 根据解析出的昵称匹配团体成员的 user_id。
 *
 * 匹配规则：
 *  - 大小写不敏感
 *  - 仅匹配 profile.nickname 与昵称完全相等的成员
 *  - 自动排除空昵称 / 缺失 profile 的成员
 *
 * @returns 去重后的 user_id 数组
 */
export function extractMentionedUserIds(
  content: string,
  members: MentionMember[]
): string[] {
  const names = parseMentions(content);
  if (names.length === 0 || !members || members.length === 0) return [];

  // 构建小写昵称 -> user_id 的映射（一个昵称可能对应多个用户，全部命中）
  const lowerNames = names.map((n) => n.toLowerCase());
  const ids = new Set<string>();

  for (const member of members) {
    const nickname = member.profile?.nickname;
    if (!nickname || !member.user_id) continue;
    if (lowerNames.includes(nickname.toLowerCase())) {
      ids.add(member.user_id);
    }
  }

  return Array.from(ids);
}
