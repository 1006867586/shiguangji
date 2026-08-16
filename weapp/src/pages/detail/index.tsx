import { useCallback, useEffect, useState } from "react";
import Taro, {
  useDidShow,
  useShareAppMessage,
  useShareTimeline,
} from "@tarojs/taro";
import { View, Text, Image, Input, Button, Textarea } from "@tarojs/components";
import {
  fetchActivityDetail,
  fetchComments,
  postComment,
  toggleLike,
  addActivityPhoto,
  updateActivity,
  deleteActivityPhoto,
  parseLink,
  msgSecCheck,
  sceneToActivityId,
  type ActivityLite,
  type ActivityPhotoLite,
  type CommentLite,
  type LinkPreviewResult,
} from "@/utils/api";
import { uploadToR2 } from "@/utils/upload";
import { getCurrentUserId } from "@/utils/auth";
import { formatRelativeTime } from "@/utils/time";
import ActivityCard from "@/components/ActivityCard";
import PhotoGrid from "@/components/PhotoGrid";
import "./index.scss";

const MAX_ADD_PHOTOS = 9;

/**
 * 活动详情页：完整卡片 + 照片补充/删除 + 编辑（作者）+ 评论区。
 * 入口：普通跳转带 id；扫海报小程序码进入带 scene（uuid 去横线）。
 */
export default function DetailPage() {
  const [id, setId] = useState<string>("");
  const [activity, setActivity] = useState<ActivityLite | null>(null);
  const [comments, setComments] = useState<CommentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  // 照片补充 / 编辑
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editLinkPreview, setEditLinkPreview] = useState<LinkPreviewResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const currentUserId = getCurrentUserId();
  const isAuthor =
    !!activity && !!currentUserId && activity.author?.id === currentUserId;

  /** 兼容 id 直跳与小程序码 scene 两种入口 */
  const resolveId = () => {
    const params = Taro.getCurrentInstance().router?.params ?? {};
    if (params.id) return params.id;
    if (params.scene) return sceneToActivityId(decodeURIComponent(params.scene)) ?? "";
    return "";
  };

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

  const reload = useCallback(() => {
    if (id) void load(id);
  }, [id, load]);

  useDidShow(() => {
    const activityId = resolveId();
    if (activityId && activityId !== id) {
      setId(activityId);
      void load(activityId);
    } else if (activityId) {
      // 返回本页时刷新评论数
      void load(activityId);
    }
  });

  useEffect(() => {
    const activityId = resolveId();
    if (activityId) {
      setId(activityId);
      void load(activityId);
    }
  }, [load]);

  // 转发卡片：店名优先，正文摘要兜底；封面用首图或商家封面
  useShareAppMessage(() => {
    if (!activity) {
      return { title: "飨刻 · 聚餐记录", path: "/pages/index/index" };
    }
    const store = activity.external_link?.title;
    const author = activity.author?.nickname || "饭友";
    const title = store
      ? `【${store}】${activity.content ? activity.content.slice(0, 24) : "一起去吃？"}`
      : `${author} 在飨刻分享了聚餐记录`;
    const imageUrl =
      activity.photos?.[0]?.url ?? activity.external_link?.coverImage ?? undefined;
    return {
      title,
      path: `/pages/detail/index?id=${activity.id}`,
      imageUrl,
    };
  });

  // 朋友圈分享（仅 Android/iOS 主流版本支持）
  useShareTimeline(() => {
    if (!activity) return { title: "飨刻 · 聚餐记录" };
    const store = activity.external_link?.title;
    const title = store
      ? `【${store}】一起聚餐`
      : `${activity.author?.nickname || "饭友"} 的聚餐记录`;
    const imageUrl =
      activity.photos?.[0]?.url ?? activity.external_link?.coverImage ?? undefined;
    return { title, query: `id=${activity.id}`, imageUrl };
  });

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

  // ---- 照片补充：选图 → R2 直传 → 挂到活动 ----
  const addPhotos = async () => {
    if (addingPhotos || !id) return;
    const remain = MAX_ADD_PHOTOS - (activity?.photos?.length ?? 0);
    if (remain <= 0) {
      Taro.showToast({ title: "照片已满（9 张）", icon: "none" });
      return;
    }
    try {
      const res = await Taro.chooseMedia({
        count: remain,
        mediaType: ["image"],
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      const files = res.tempFiles.map((f) => f.tempFilePath);
      if (!files.length) return;
      setAddingPhotos(true);
      Taro.showLoading({ title: "上传中…", mask: true });
      for (let i = 0; i < files.length; i++) {
        Taro.showLoading({
          title: `上传 ${i + 1}/${files.length}`,
          mask: true,
        });
        const url = await uploadToR2(files[i]);
        await addActivityPhoto(id, url, "image");
      }
      Taro.hideLoading();
      Taro.showToast({ title: "照片已补充", icon: "success" });
      reload();
    } catch {
      Taro.hideLoading();
      // 用户取消或 request 层已 toast
    } finally {
      setAddingPhotos(false);
    }
  };

  // ---- 删除照片：作者可删全部，其他人仅自己的（后端兜底） ----
  const handleDeletePhoto = async (photo: ActivityPhotoLite) => {
    if (deletingPhotoId || !id) return;
    const m = await Taro.showModal({
      title: "删除照片",
      content: "确定删除这张照片？",
    });
    if (!m.confirm) return;
    setDeletingPhotoId(photo.id);
    try {
      await deleteActivityPhoto(id, photo.id);
      Taro.showToast({ title: "已删除", icon: "success" });
      reload();
    } catch {
      // request 层已 toast
    } finally {
      setDeletingPhotoId(null);
    }
  };

  // ---- 编辑：打开表单（预填当前正文与商家链接） ----
  const openEdit = () => {
    if (!activity) return;
    setEditContent(activity.content ?? "");
    setEditLinkUrl("");
    const link = activity.external_link;
    setEditLinkPreview(
      link
        ? {
            platform: link.platform || "other",
            url: link.url || "",
            title: link.title || "",
            coverImage: link.coverImage ?? null,
            rating: link.rating ?? null,
            address: link.address ?? null,
            phone: link.phone ?? null,
            price: link.price ?? null,
            category: link.category ?? null,
          }
        : null
    );
    setEditing(true);
  };

  const closeEdit = () => {
    setEditing(false);
    setEditLinkPreview(null);
    setEditLinkUrl("");
  };

  const handleEditParseLink = async () => {
    const input = editLinkUrl.trim();
    if (!input) {
      Taro.showToast({ title: "请粘贴链接或分享文本", icon: "none" });
      return;
    }
    setParsing(true);
    try {
      const res = await parseLink(input);
      if (res) {
        setEditLinkPreview(res);
        Taro.showToast({
          title: res.title ? "解析成功" : "已保存，可手动补充",
          icon: "none",
        });
      }
    } catch {
      // request 层已 toast
    } finally {
      setParsing(false);
    }
  };

  const clearEditLink = () => {
    setEditLinkPreview(null);
    setEditLinkUrl("");
  };

  const saveEdit = async () => {
    if (savingEdit || !id) return;
    const text = editContent.trim();
    if (!text && !editLinkPreview) {
      Taro.showToast({ title: "内容和链接不能同时为空", icon: "none" });
      return;
    }
    // 内容安全前置检测（scene 1 资料类）
    if (text) {
      try {
        const sec = await msgSecCheck(text, 1);
        if (!sec.pass) {
          Taro.showModal({
            title: "内容无法保存",
            content: sec.reason ?? "内容包含违规信息，请修改后重试",
            showCancel: false,
          });
          return;
        }
      } catch {
        // 检测接口不可达：放行（服务端校验兜底）
      }
    }
    setSavingEdit(true);
    try {
      await updateActivity(id, {
        content: text || null,
        externalLink: editLinkPreview
          ? {
              platform: editLinkPreview.platform || "other",
              url: editLinkPreview.url || editLinkUrl.trim(),
              title: editLinkPreview.title || "",
              coverImage: editLinkPreview.coverImage,
              rating: editLinkPreview.rating,
              address: editLinkPreview.address,
              phone: editLinkPreview.phone,
              price: editLinkPreview.price,
              category: editLinkPreview.category,
            }
          : null,
      });
      Taro.showToast({ title: "已保存", icon: "success" });
      closeEdit();
      reload();
    } catch {
      // request 层已 toast
    } finally {
      setSavingEdit(false);
    }
  };

  // 发评论
  const submitComment = async () => {
    const text = commentText.trim();
    if (!text || !id || sending) return;
    setSending(true);
    try {
      // 内容安全前置检测（scene 2 评论）
      try {
        const sec = await msgSecCheck(text, 2);
        if (!sec.pass) {
          Taro.showModal({
            title: "评论无法发送",
            content: sec.reason ?? "评论包含违规信息，请修改后重试",
            showCancel: false,
          });
          return;
        }
      } catch {
        // 检测接口不可达：放行（服务端入库校验兜底）
      }
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
      {/* 编辑表单（作者，置于顶部） */}
      {editing && (
        <View className="edit-panel">
          <View className="edit-head">
            <Text className="edit-title">编辑动态</Text>
            <Text className="edit-close" onClick={closeEdit}>关闭</Text>
          </View>

          <Textarea
            className="edit-content"
            value={editContent}
            placeholder="说点什么…"
            maxlength={2000}
            onInput={(e) => setEditContent(e.detail.value)}
          />

          <View className="edit-link-row">
            <Textarea
              className="edit-link-input"
              value={editLinkUrl}
              placeholder="粘贴美团/点评链接（可选）"
              maxlength={1000}
              autoHeight
              onInput={(e) => setEditLinkUrl(e.detail.value)}
            />
            <Button
              size="mini"
              type="primary"
              loading={parsing}
              disabled={!editLinkUrl.trim() || parsing}
              onClick={handleEditParseLink}
            >
              解析
            </Button>
          </View>

          {editLinkPreview && (
            <View className="edit-link-preview">
              <Text className="edit-link-title">
                {editLinkPreview.title || "未识别到店名"}
              </Text>
              {editLinkPreview.rating ? (
                <Text className="edit-link-rating">★ {editLinkPreview.rating.toFixed(1)}</Text>
              ) : null}
              <Text className="edit-link-clear" onClick={clearEditLink}>移除</Text>
            </View>
          )}

          <View className="edit-actions">
            <Button
              size="mini"
              onClick={closeEdit}
            >
              取消
            </Button>
            <Button
              size="mini"
              type="primary"
              loading={savingEdit}
              disabled={savingEdit}
              onClick={() => void saveEdit()}
            >
              保存
            </Button>
          </View>
        </View>
      )}

      {/* 详情主体：复用动态卡片（只读图集） */}
      <ActivityCard
        activity={activity}
        onLike={handleLike}
        currentUserId={currentUserId ?? undefined}
        onEdit={() => openEdit()}
        onDeleted={() => {
          Taro.showToast({ title: "已删除", icon: "success" });
          setTimeout(() => Taro.navigateBack(), 600);
        }}
      />

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

      {/* 照片墙（web 同款：独立卡片 + 轻量按钮） */}
      <View className="photo-wall">
        <View className="photo-wall-head">
          <Text className="photo-wall-title">照片墙</Text>
          <Text className="wall-link add" onClick={() => void addPhotos()}>
            {addingPhotos ? "上传中…" : "补充照片"}
          </Text>
        </View>

        {activity.photos?.length ? (
          <PhotoGrid
            photos={activity.photos}
            onDeletePhoto={handleDeletePhoto}
            canDeletePhoto={(p) => isAuthor || p.uploaded_by === currentUserId}
          />
        ) : (
          <View className="photo-wall-empty">
            <Text className="text-muted">还没有照片，点击「补充照片」上传</Text>
          </View>
        )}
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
