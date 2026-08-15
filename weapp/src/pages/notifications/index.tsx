import { useCallback, useRef, useState } from "react";
import Taro, { useDidShow, useReachBottom } from "@tarojs/taro";
import { View, Text, Image, Button } from "@tarojs/components";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationLite,
} from "@/utils/api";
import { formatRelativeTime } from "@/utils/time";
import "./index.scss";

const PAGE_SIZE = 30;

/** 通知类型 → 展示文案（data.snippet 为内容摘要时拼接） */
function describe(n: NotificationLite): string {
  const who = n.actor?.nickname ? `${n.actor.nickname} ` : "";
  const snippet = typeof n.data?.snippet === "string" ? n.data.snippet : "";
  const map: Record<string, string> = {
    comment: `${who}评论了你的动态`,
    reply: `${who}回复了你的评论`,
    like: `${who}赞了你的动态`,
    repost: `${who}转发了你的动态`,
    mention: `${who}在动态中提到了你`,
    photo_added: `${who}向动态添加了照片`,
    rsvp: `${who}更新了报名状态`,
    split: `${who}发起了聚餐分账`,
    group_invite: "你收到了圈子邀请",
    report_resolved: "你的举报已处理",
    system: "系统通知",
  };
  const base = map[n.type] ?? "收到一条新通知";
  return snippet ? `${base}：${snippet}` : base;
}

/** 通知列表：cursor 分页 + 触底加载 + 点击已读（带 activity_id 的跳详情） */
export default function NotificationsPage() {
  const [list, setList] = useState<NotificationLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [finished, setFinished] = useState(false);

  const cursorRef = useRef<string | null>(null);
  const requestingRef = useRef(false);

  const load = useCallback(async (refresh: boolean) => {
    if (requestingRef.current) return;
    requestingRef.current = true;
    if (refresh) {
      setLoading(true);
      setFinished(false);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await fetchNotifications({
        cursor: refresh ? null : cursorRef.current,
        limit: PAGE_SIZE,
      });
      const rows = res?.data ?? [];
      cursorRef.current = res?.next_cursor ?? null;
      setList((prev) => (refresh ? rows : [...prev, ...rows]));
      if (!res?.next_cursor) setFinished(true);
    } finally {
      requestingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useDidShow(() => {
    void load(true);
  });

  useReachBottom(() => {
    if (finished || loadingMore || requestingRef.current) return;
    void load(false);
  });

  // 点击：标记已读；带 activity_id 的跳活动详情
  const handleTap = async (n: NotificationLite) => {
    if (!n.read_at) {
      setList((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
      try {
        await markNotificationRead(n.id);
      } catch {
        // 静默失败，下次刷新恢复
      }
    }
    if (n.activity_id) {
      Taro.navigateTo({ url: `/pages/detail/index?id=${n.activity_id}` });
    }
  };

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead();
      setList((prev) =>
        prev.map((item) =>
          item.read_at ? item : { ...item, read_at: new Date().toISOString() }
        )
      );
      Taro.showToast({ title: "已全部标记为已读", icon: "none" });
    } catch {
      // request 层已 toast
    }
  };

  const hasUnread = list.some((n) => !n.read_at);

  return (
    <View className="ntf-page">
      {hasUnread && (
        <View className="read-all-bar">
          <Text className="hint">有未读通知</Text>
          <Button size="mini" onClick={handleReadAll}>
            全部已读
          </Button>
        </View>
      )}

      {loading && list.length === 0 && (
        <View className="state">
          <Text className="text-muted">加载中…</Text>
        </View>
      )}

      {!loading && list.length === 0 && (
        <View className="state">
          <Text className="text-muted">暂无通知</Text>
        </View>
      )}

      {list.map((n) => (
        <View
          key={n.id}
          className={`ntf-item ${n.read_at ? "" : "unread"}`}
          onClick={() => handleTap(n)}
        >
          <Image
            className="ntf-avatar"
            src={n.actor?.avatar_url || "https://img.example.com/avatar-default.png"}
            mode="aspectFill"
          />
          <View className="ntf-main">
            <Text className="ntf-text">{describe(n)}</Text>
            <Text className="ntf-time">{formatRelativeTime(n.created_at)}</Text>
          </View>
          {!n.read_at && <View className="unread-dot" />}
        </View>
      ))}

      {loadingMore && (
        <View className="state">
          <Text className="text-muted">加载中…</Text>
        </View>
      )}
      {finished && list.length > 0 && (
        <View className="state">
          <Text className="text-muted">— 到底了 —</Text>
        </View>
      )}
    </View>
  );
}
