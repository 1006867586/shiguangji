import { useCallback, useEffect, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Image, Input, Button } from "@tarojs/components";
import {
  fetchActivityDetail,
  fetchComments,
  postComment,
  toggleLike,
  type ActivityLite,
  type CommentLite,
} from "@/utils/api";
import { formatRelativeTime } from "@/utils/time";
import ActivityCard from "@/components/ActivityCard";
import "./index.scss";

/**
 * 活动详情页：完整卡片 + 评论区（楼中楼展示，回复固定到一级）+ 点赞。
 */
export default function DetailPage() {
  const [id, setId] = useState<string>("");
  const [activity, setActivity] = useState<ActivityLite | null>(null);
  const [comments, setComments] = useState<CommentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async (activityId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [a, c] = await Promise.all([
        fetchActivityDetail(activityId),
        fetchComments(activityId),
      ]);
      setActivity(a);
      setComments(Array.isArray(c) ? c : []);
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    const params = Taro.getCurrentInstance().router?.params;
    const activityId = params?.id ?? "";
    if (activityId && activityId !== id) {
      setId(activityId);
      void load(activityId);
    } else if (activityId) {
      // 返回本页时刷新评论数
      void load(activityId);
    }
  });

  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params;
    const activityId = params?.id ?? "";
    if (activityId) {
      setId(activityId);
      void load(activityId);
    }
  }, [load]);

  // 点赞：乐观更新 + 失败回滚
  const handleLike = async (a: ActivityLite) => {
    if (!activity) return;
    setActivity({
      ...activity,
      is_liked: !a.is_liked,
      like_count: a.like_count + (a.is_liked ? -1 : 1),
    });
    try {
      await toggleLike(a.id);
    } catch {
      setActivity({ ...activity });
    }
  };

  // 发评论
  const submitComment = async () => {
    const text = commentText.trim();
    if (!text || !id || sending) return;
    setSending(true);
    try {
      await postComment(id, text);
      setCommentText("");
      Taro.hideKeyboard();
      // 重新拉评论 + 更新评论数
      const [a, c] = await Promise.all([fetchActivityDetail(id), fetchComments(id)]);
      setActivity(a);
      setComments(Array.isArray(c) ? c : []);
      Taro.showToast({ title: "评论成功", icon: "success" });
    } catch {
      // request 层已 toast
    } finally {
      setSending(false);
    }
  };

  if (loading && !activity) {
    return (
      <View className="detail-page state">
        <Text className="text-muted">加载中…</Text>
      </View>
    );
  }

  if (error || !activity) {
    return (
      <View className="detail-page state">
        <Text className="error">{error || "内容不存在"}</Text>
        <Button size="mini" onClick={() => id && load(id)}>
          重试
        </Button>
      </View>
    );
  }

  return (
    <View className="detail-page">
      {/* 详情主体：复用动态卡片 */}
      <ActivityCard activity={activity} onLike={handleLike} />

      {/* 评论区 */}
      <View className="comment-section">
        <View className="comment-header">
          <Text className="comment-title">评论 {comments.length > 0 ? `(${comments.length})` : ""}</Text>
        </View>

        {comments.length === 0 && (
          <View className="comment-empty">
            <Text className="text-muted">还没有评论，来说两句</Text>
          </View>
        )}

        {comments.map((c) => (
          <View key={c.id} className="comment-item">
            <Image
              className="comment-avatar"
              src={c.author?.avatar_url || "https://img.example.com/avatar-default.png"}
              mode="aspectFill"
            />
            <View className="comment-main">
              <View className="comment-top">
                <Text className="comment-nickname">{c.author?.nickname || "饭友"}</Text>
                <Text className="comment-time">{formatRelativeTime(c.created_at)}</Text>
              </View>
              <Text className="comment-content">{c.content}</Text>

              {/* 楼中楼 */}
              {c.replies && c.replies.length > 0 && (
                <View className="reply-list">
                  {c.replies.map((r) => (
                    <View key={r.id} className="reply-item">
                      <Text className="reply-nickname">{r.author?.nickname || "饭友"}</Text>
                      <Text className="reply-content">{r.content}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* 底部评论输入框 */}
      <View className="comment-input-bar">
        <Input
          className="comment-input"
          value={commentText}
          placeholder="说点什么…"
          confirmType="send"
          maxlength={500}
          onInput={(e) => setCommentText(e.detail.value)}
          onConfirm={() => void submitComment()}
        />
        <Button
          className="comment-send"
          size="mini"
          type="primary"
          disabled={!commentText.trim() || sending}
          onClick={() => void submitComment()}
        >
          发送
        </Button>
      </View>
    </View>
  );
}
