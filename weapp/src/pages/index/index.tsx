import { useCallback, useRef, useState } from "react";
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { ScrollView, View, Text, Button } from "@tarojs/components";
import { request, ApiError } from "@/utils/request";
import { isLoggedIn } from "@/utils/auth";
import {
  fetchGroups,
  fetchFeed,
  toggleLike,
  type GroupLite,
  type ActivityLite,
} from "@/utils/api";
import ActivityCard from "@/components/ActivityCard";
import "./index.scss";

const PAGE_SIZE = 20;

/**
 * 动态流页（TabBar 首页）：圈子切换 + cursor 分页 + 下拉刷新 + 触底加载。
 */
export default function IndexPage() {
  const [groups, setGroups] = useState<GroupLite[] | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string>("");
  const [feed, setFeed] = useState<ActivityLite[]>([]);
  const [loading, setLoading] = useState(false); // 首屏/切圈子 loading
  const [loadingMore, setLoadingMore] = useState(false);
  const [finished, setFinished] = useState(false); // 没有更多
  const [error, setError] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const requestingRef = useRef(false); // 防重复请求
  const loggedIn = isLoggedIn();

  // ---- 首次加载圈子列表，默认选第一个 ----
  const loadGroups = useCallback(async () => {
    try {
      const list = await fetchGroups();
      setGroups(list);
      if (list.length > 0 && !activeGroupId) {
        setActiveGroupId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载圈子失败");
    }
  }, [activeGroupId]);

  // ---- 加载 feed（refresh=true 重置；false 追加） ----
  const loadFeed = useCallback(
    async (groupId: string, refresh: boolean) => {
      if (requestingRef.current) return;
      requestingRef.current = true;
      if (refresh) {
        setLoading(true);
        setFinished(false);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const res = await fetchFeed({
          groupId,
          cursor: refresh ? null : cursorRef.current,
          limit: PAGE_SIZE,
        });
        const list = res?.data ?? [];
        cursorRef.current = res?.next_cursor ?? null;
        setFeed((prev) => (refresh ? list : [...prev, ...list]));
        if (!res?.next_cursor) setFinished(true);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "加载动态失败");
      } finally {
        requestingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // 首次进入 / 圈子切换
  useDidShow(() => {
    if (!loggedIn) return;
    if (groups === null) {
      void loadGroups();
    }
  });

  // activeGroupId 就绪后拉首屏 feed
  const prevGroupRef = useRef<string>("");
  if (activeGroupId && prevGroupRef.current !== activeGroupId) {
    prevGroupRef.current = activeGroupId;
    cursorRef.current = null;
    if (!requestingRef.current && loggedIn) {
      void loadFeed(activeGroupId, true);
    }
  }

  // 下拉刷新：重拉圈子 + feed
  usePullDownRefresh(async () => {
    try {
      if (activeGroupId) {
        await loadFeed(activeGroupId, true);
        await loadGroups();
      } else {
        await loadGroups();
      }
    } finally {
      Taro.stopPullDownRefresh();
    }
  });

  // 触底加载下一页
  useReachBottom(() => {
    if (!activeGroupId || finished || loadingMore || requestingRef.current) return;
    void loadFeed(activeGroupId, false);
  });

  // 切换圈子
  const switchGroup = (id: string) => {
    if (id === activeGroupId) return;
    setActiveGroupId(id);
  };

  // 点赞乐观更新
  const handleLike = async (a: ActivityLite) => {
    // 乐观翻转
    setFeed((prev) =>
      prev.map((item) =>
        item.id === a.id
          ? {
              ...item,
              is_liked: !item.is_liked,
              like_count: item.like_count + (item.is_liked ? -1 : 1),
            }
          : item
      )
    );
    try {
      await toggleLike(a.id);
    } catch {
      // 失败回滚
      setFeed((prev) =>
        prev.map((item) =>
          item.id === a.id
            ? {
                ...item,
                is_liked: a.is_liked,
                like_count: a.like_count,
              }
            : item
        )
      );
    }
  };

  const goDetail = (a: ActivityLite) => {
    Taro.navigateTo({ url: `/pages/detail/index?id=${a.id}` });
  };

  // ---- 未登录 ----
  if (!loggedIn) {
    return (
      <View className="page placeholder">
        <Text className="title">欢迎使用「想聚」</Text>
        <Text className="text-muted">登录后查看你的饭局动态</Text>
        <Button
          className="btn-primary"
          type="primary"
          onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
        >
          去登录
        </Button>
      </View>
    );
  }

  // ---- 加载圈子中 ----
  if (groups === null && !error) {
    return (
      <View className="page placeholder">
        <Text className="text-muted">加载中…</Text>
      </View>
    );
  }

  // ---- 没有圈子 ----
  if (groups && groups.length === 0) {
    return (
      <View className="page placeholder">
        <Text className="title">还没有圈子</Text>
        <Text className="text-muted">请先在 Web 端创建或加入圈子</Text>
      </View>
    );
  }

  return (
    <View className="page feed-page">
      {/* 圈子切换 tab（横向滚动） */}
      <ScrollView className="group-tabs" scrollX enableFlex>
        {groups?.map((g) => (
          <View
            key={g.id}
            className={`group-tab ${g.id === activeGroupId ? "active" : ""}`}
            onClick={() => switchGroup(g.id)}
          >
            <Text>{g.name}</Text>
          </View>
        ))}
      </ScrollView>

      {/* feed 列表 */}
      <View className="feed-list">
        {loading && feed.length === 0 && (
          <View className="feed-state">
            <Text className="text-muted">加载中…</Text>
          </View>
        )}

        {error && feed.length === 0 && (
          <View className="feed-state">
            <Text className="error">{error}</Text>
            <Button
              size="mini"
              onClick={() => activeGroupId && loadFeed(activeGroupId, true)}
            >
              重试
            </Button>
          </View>
        )}

        {!loading && !error && feed.length === 0 && (
          <View className="feed-state">
            <Text className="text-muted">圈子还没有动态，发一条吧</Text>
          </View>
        )}

        {feed.map((a) => (
          <ActivityCard
            key={a.id}
            activity={a}
            onLike={handleLike}
            onTap={goDetail}
          />
        ))}

        {loadingMore && (
          <View className="feed-state">
            <Text className="text-muted">加载中…</Text>
          </View>
        )}
        {finished && feed.length > 0 && (
          <View className="feed-state">
            <Text className="text-muted">— 到底了 —</Text>
          </View>
        )}
      </View>
    </View>
  );
}
