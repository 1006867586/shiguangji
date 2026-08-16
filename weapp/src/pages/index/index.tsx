import { useCallback, useRef, useState } from "react";
import Taro, {
  useDidShow,
  usePullDownRefresh,
  useReachBottom,
  useShareAppMessage,
} from "@tarojs/taro";
import { ScrollView, View, Text, Button, Input } from "@tarojs/components";
import { request, ApiError } from "@/utils/request";
import { isLoggedIn, getCurrentUserId } from "@/utils/auth";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import {
  fetchGroups,
  fetchFeed,
  toggleLike,
  joinGroup,
  type GroupLite,
  type ActivityLite,
} from "@/utils/api";
import ActivityCard from "@/components/ActivityCard";
import LoginGuide from "@/components/LoginGuide";
import "./index.scss";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE = 300;

/**
 * 打卡流页（TabBar 首页）：顶部搜索框 + 饭搭子下拉切换 + cursor 分页 + 下拉刷新 + 触底加载。
 * 兼容饭搭子转发卡片进入：path 带 inviteCode 时弹窗确认加入。
 */
export default function IndexPage() {
  const [groups, setGroups] = useState<GroupLite[] | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string>("");
  const [feed, setFeed] = useState<ActivityLite[]>([]);
  const [loading, setLoading] = useState(false); // 首屏/切饭搭子/搜索 loading
  const [loadingMore, setLoadingMore] = useState(false);
  const [finished, setFinished] = useState(false); // 没有更多
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState(""); // 搜索关键词（输入即更新，防抖后才请求）
  const [showGroupSheet, setShowGroupSheet] = useState(false); // 饭搭子切换半屏弹层
  // 关键：用 state 而不是 const，useDidShow 时重新读 storage
  // （登录页 setStorageSync 后 switchTab 切回打卡 tab，需要刷新登录态）
  const [loggedIn, setLoggedIn] = useState<boolean>(isLoggedIn());

  const cursorRef = useRef<string | null>(null);
  const requestingRef = useRef(false); // 防重复请求
  const inviteHandledRef = useRef(false);
  const keywordRef = useRef(""); // 给异步回调读最新搜索词
  const activeGroupIdRef = useRef("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedSeqRef = useRef(0); // feed 请求序号，用于「最新请求优先」

  // 默认转发卡片（右上角菜单 / 卡片分享按钮未命中详情页时）
  useShareAppMessage(() => ({
    title: "飨刻 — 和饭搭子一起记录每一顿",
    path: "/pages/index/index",
  }));

  // ---- 首次加载饭搭子列表，默认选第一个；处理分享卡邀请码 ----
  const loadGroups = useCallback(async () => {
    try {
      const list = await fetchGroups();
      setGroups(list);
      if (list.length > 0 && !activeGroupId) {
        setActiveGroupId(list[0].id);
      }

      // 分享卡片带 inviteCode：未加入该饭搭子时弹窗确认加入
      const inviteCode = Taro.getCurrentInstance().router?.params?.inviteCode;
      if (inviteCode && !inviteHandledRef.current) {
        inviteHandledRef.current = true;
        const joined = list.find(
          (g) => g.invite_code?.toUpperCase() === inviteCode.toUpperCase()
        );
        if (!joined) {
          const res = await Taro.showModal({
            title: "加入饭搭子",
            content: "好友邀请你加入 TA 的饭搭子，是否加入？",
            confirmText: "加入",
          });
          if (res.confirm) {
            try {
              const group = await joinGroup(inviteCode);
              const refreshed = await fetchGroups();
              setGroups(refreshed);
              if (group?.id) setActiveGroupId(group.id);
              Taro.showToast({ title: "加入成功", icon: "success" });
            } catch {
              // 邀请码无效等，request 层已 toast
            }
          }
        } else {
          setActiveGroupId(joined.id);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载饭搭子失败");
    }
  }, [activeGroupId]);

  // ---- 加载 feed（refresh=true 重置；false 追加）。kw 传入本次搜索词 ----
  // 采用「最新请求优先」：refresh 类请求（搜索/切饭搭子/刷新）不因 in-flight 被丢弃，
  // 而是递增序号接管；旧请求的响应回来后发现序号过期则作废，避免结果回跳/串台。
  const loadFeed = useCallback(
    async (groupId: string, refresh: boolean, kw = "") => {
      const seq = ++feedSeqRef.current;
      if (refresh) {
        setLoading(true);
        setFinished(false);
        setError(null);
      } else {
        // 触底追加仍需防重
        if (requestingRef.current) return;
        setLoadingMore(true);
        setError(null);
      }
      requestingRef.current = true;
      try {
        const res = await fetchFeed({
          groupId,
          cursor: refresh ? null : cursorRef.current,
          limit: PAGE_SIZE,
          keyword: kw || undefined,
        });
        if (seq !== feedSeqRef.current) return; // 已有更新的请求，丢弃过期结果
        const list = res?.data ?? [];
        cursorRef.current = res?.next_cursor ?? null;
        setFeed((prev) => (refresh ? list : [...prev, ...list]));
        if (!res?.next_cursor) setFinished(true);
      } catch (err) {
        if (seq !== feedSeqRef.current) return;
        setError(err instanceof ApiError ? err.message : "加载打卡失败");
      } finally {
        // 仅最新请求负责解锁/收尾，避免清掉后发请求的状态
        if (seq === feedSeqRef.current) {
          requestingRef.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    []
  );

  // 首次进入 / 饭搭子切换
  useDidShow(() => {
    setSelectedTab(0);
    // 每次显示都重新读登录态：从登录页 setStorageSync 后 switchTab 回来时才不会卡在「去登录」
    const cur = isLoggedIn();
    if (cur !== loggedIn) setLoggedIn(cur);
    if (!cur) return;
    if (groups === null) {
      void loadGroups();
    }
  });

  // activeGroupId 就绪后拉首屏 feed（切换饭搭子 / 首次进入）
  const prevGroupRef = useRef<string>("");
  if (activeGroupId && prevGroupRef.current !== activeGroupId) {
    prevGroupRef.current = activeGroupId;
    activeGroupIdRef.current = activeGroupId;
    cursorRef.current = null;
    if (loggedIn) {
      void loadFeed(activeGroupId, true, keywordRef.current);
    }
  }

  // 下拉刷新：重拉饭搭子 + feed（保持搜索词）
  usePullDownRefresh(async () => {
    try {
      if (activeGroupId) {
        await loadFeed(activeGroupId, true, keywordRef.current);
        await loadGroups();
      } else {
        await loadGroups();
      }
    } finally {
      Taro.stopPullDownRefresh();
    }
  });

  // 触底加载下一页（保持搜索词）
  useReachBottom(() => {
    if (!activeGroupId || finished || loadingMore || requestingRef.current) return;
    void loadFeed(activeGroupId, false, keywordRef.current);
  });

  // 切换饭搭子：保留搜索词继续在当前饭搭子搜
  const switchGroup = (id: string) => {
    setShowGroupSheet(false);
    if (id === activeGroupId) return;
    setActiveGroupId(id);
  };

  // 搜索输入：立即更新输入框，防抖后重新拉取
  const onSearchInput = (e: { detail: { value: string } }) => {
    const kw = e.detail.value;
    setKeyword(kw);
    keywordRef.current = kw;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const gid = activeGroupIdRef.current;
      if (gid) void loadFeed(gid, true, kw);
    }, SEARCH_DEBOUNCE);
  };

  // 清空搜索
  const onClearSearch = () => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setKeyword("");
    keywordRef.current = "";
    const gid = activeGroupIdRef.current;
    if (gid) void loadFeed(gid, true, "");
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
    return <LoginGuide subtitle="登录后查看你的饭局打卡" />;
  }

  // ---- 加载饭搭子中 ----
  if (groups === null && !error) {
    return (
      <View className="page placeholder">
        <Text className="text-muted">加载中…</Text>
      </View>
    );
  }

  // ---- 没有饭搭子 ----
  if (groups && groups.length === 0) {
    return (
      <View className="page placeholder">
        <Text className="title">还没有饭搭子</Text>
        <Text className="text-muted">创建一个，或用好友的邀请码加入</Text>
        <Button
          className="btn-primary"
          type="primary"
          onClick={() => Taro.navigateTo({ url: "/pages/groups/index" })}
        >
          去创建 / 加入
        </Button>
      </View>
    );
  }

  const activeGroup = groups?.find((g) => g.id === activeGroupId);
  const searching = keyword.trim() !== "";

  return (
    <View className="page feed-page has-tabbar">
      {/* 顶部：当前饭搭子胶囊 + 搜索框（吸顶） */}
      <View className="feed-header">
        <View className="group-pill" onClick={() => setShowGroupSheet(true)}>
          <Text className="group-pill-icon">🍜</Text>
          <Text className="group-pill-name">{activeGroup?.name ?? "选择饭搭子"}</Text>
          <Text className="group-pill-arrow">▾</Text>
        </View>
        <View className="search-box">
          <Text className="search-icon">🔍</Text>
          <Input
            className="search-input"
            value={keyword}
            placeholder="搜索打卡"
            placeholderClass="search-placeholder"
            confirmType="search"
            onInput={onSearchInput}
          />
          {searching && (
            <Text className="search-clear" onClick={onClearSearch}>
              ✕
            </Text>
          )}
        </View>
      </View>

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
              onClick={() => activeGroupId && loadFeed(activeGroupId, true, keywordRef.current)}
            >
              重试
            </Button>
          </View>
        )}

        {!loading && !error && feed.length === 0 && (
          <View className="feed-state">
            <Text className="text-muted">
              {searching ? "没有找到相关打卡" : "饭搭子还没有打卡，发一条吧"}
            </Text>
          </View>
        )}

        {feed.map((a) => (
          <ActivityCard
            key={a.id}
            activity={a}
            onLike={handleLike}
            onTap={goDetail}
            currentUserId={getCurrentUserId() ?? undefined}
            onEdit={(act) =>
              Taro.navigateTo({ url: `/pages/detail/index?id=${act.id}` })
            }
            onDeleted={(act) =>
              setFeed((prev) => prev.filter((x) => x.id !== act.id))
            }
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

      {/* 饭搭子切换半屏弹层 */}
      {showGroupSheet && (
        <View className="sheet-mask" onClick={() => setShowGroupSheet(false)}>
          <View className="group-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="sheet-title">
              <Text>切换饭搭子</Text>
              <Text
                className="sheet-close"
                onClick={() => setShowGroupSheet(false)}
              >
                ✕
              </Text>
            </View>
            <ScrollView scrollY className="sheet-list">
              {groups?.map((g) => (
                <View
                  key={g.id}
                  className={`sheet-item ${g.id === activeGroupId ? "active" : ""}`}
                  onClick={() => switchGroup(g.id)}
                >
                  <Text className="sheet-item-name">{g.name}</Text>
                  {g.id === activeGroupId && (
                    <Text className="sheet-item-check">✓</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
