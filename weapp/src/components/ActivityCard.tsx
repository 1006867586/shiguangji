import { View, Text, Image, Button, Picker, Textarea } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import type {
  ActivityLite,
  ActivityPhotoLite,
  GroupLite,
} from "@/utils/api";
import { deleteActivity, repostActivity, createReport, fetchGroups } from "@/utils/api";
import { formatRelativeTime } from "@/utils/time";
import PhotoGrid from "./PhotoGrid";
import LinkCard from "./LinkCard";
import "./ActivityCard.scss";

const REPORT_REASONS: Array<{ key: "spam" | "abuse" | "porn" | "illegal" | "other"; label: string }> = [
  { key: "spam", label: "垃圾广告" },
  { key: "abuse", label: "辱骂攻击" },
  { key: "porn", label: "色情低俗" },
  { key: "illegal", label: "违法违规" },
  { key: "other", label: "其他" },
];

interface Props {
  activity: ActivityLite;
  /** 点赞回调（乐观更新由页面处理） */
  onLike?: (a: ActivityLite) => void;
  /** 卡片点击进详情（操作按钮区域点击不触发） */
  onTap?: (a: ActivityLite) => void;
  /** 提供时图集单元格显示删除角标（详情页照片管理） */
  onDeletePhoto?: (photo: ActivityPhotoLite) => void;
  /** 当前用户 id：判定作者（编辑/删除菜单） */
  currentUserId?: string;
  /** 编辑回调（详情页开编辑面板；feed 页可跳详情） */
  onEdit?: (a: ActivityLite) => void;
  /** 删除成功后回调（feed 移除 / 详情返回） */
  onDeleted?: (a: ActivityLite) => void;
}

/** 打卡卡片：作者 + ⋮菜单 + 内容 + 图集 + 链接 + 转发引用 + 图标操作栏 */
export default function ActivityCard({
  activity,
  onLike,
  onTap,
  onDeletePhoto,
  currentUserId,
  onEdit,
  onDeleted,
}: Props) {
  const a = activity;
  const isAuthor = !!currentUserId && a.author?.id === currentUserId;

  // 转发面板
  const [repostOpen, setRepostOpen] = useState(false);
  const [repostGroups, setRepostGroups] = useState<GroupLite[]>([]);
  const [repostGroupIdx, setRepostGroupIdx] = useState(0);
  const [repostComment, setRepostComment] = useState("");
  const [reposting, setReposting] = useState(false);

  // 举报面板
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]["key"]>("spam");
  const [reportDetail, setReportDetail] = useState("");
  const [reporting, setReporting] = useState(false);

  const goDetail = () => onTap?.(a);

  const handleLike = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onLike?.(a);
  };

  const handleComment = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    Taro.navigateTo({ url: `/pages/detail/index?id=${a.id}` });
  };

  // ---- ⋮ 菜单（原生 ActionSheet）----
  const openMenu = async () => {
    const items: string[] = [];
    if (isAuthor) items.push("编辑", "删除");
    items.push("举报");
    try {
      const res = await Taro.showActionSheet({ itemList: items });
      const chosen = items[res.tapIndex];
      if (chosen === "编辑") {
        onEdit?.(a);
      } else if (chosen === "删除") {
        await handleDelete();
      } else if (chosen === "举报") {
        setReportReason("spam");
        setReportDetail("");
        setReportOpen(true);
      }
    } catch {
      // 用户取消
    }
  };

  const handleDelete = async () => {
    const m = await Taro.showModal({
      title: "删除打卡",
      content: "删除后不可恢复，确定删除？",
      confirmColor: "#ef4444",
    });
    if (!m.confirm) return;
    try {
      await deleteActivity(a.id);
      Taro.showToast({ title: "已删除", icon: "success" });
      onDeleted?.(a);
    } catch {
      // request 层已 toast
    }
  };

  // ---- 转发 ----
  const openRepost = async () => {
    try {
      const groups = await fetchGroups();
      // 排除原活动所在饭搭子
      const others = groups.filter((g) => g.id !== a.group_id);
      if (others.length === 0) {
        Taro.showToast({ title: "没有可转发到的饭搭子", icon: "none" });
        return;
      }
      setRepostGroups(others);
      setRepostGroupIdx(0);
      setRepostComment("");
      setRepostOpen(true);
    } catch {
      // request 层已 toast
    }
  };

  const submitRepost = async () => {
    if (reposting) return;
    const group = repostGroups[repostGroupIdx];
    if (!group) return;
    setReposting(true);
    try {
      await repostActivity(a.id, {
        groupId: group.id,
        comment: repostComment.trim() || undefined,
      });
      Taro.showToast({ title: "转发成功", icon: "success" });
      setRepostOpen(false);
    } catch {
      // request 层已 toast（不能转发到原圈、非成员等）
    } finally {
      setReposting(false);
    }
  };

  // ---- 举报 ----
  const submitReport = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      await createReport({
        targetType: "activity",
        targetId: a.id,
        groupId: a.group_id,
        reason: reportReason,
        detail: reportDetail.trim() || undefined,
      });
      Taro.showToast({ title: "已提交举报", icon: "success" });
      setReportOpen(false);
    } catch {
      // request 层已 toast
    } finally {
      setReporting(false);
    }
  };

  const avatar = a.author?.avatar_url || "https://img.example.com/avatar-default.png";

  return (
    <View className="activity-card" onClick={goDetail}>
      {/* 头部：头像 + 昵称 + 时间 + ⋮ */}
      <View className="card-header">
        <Image className="avatar" src={avatar} mode="aspectFill" />
        <View className="header-main">
          <Text className="nickname">{a.author?.nickname || "饭友"}</Text>
          <Text className="time">{formatRelativeTime(a.created_at)}</Text>
        </View>
        {a.type === "repost" && <Text className="repost-badge">转发</Text>}
        <Image
          className="more-btn"
          src="/assets/card-icons/more-gray.png"
          mode="aspectFit"
          onClick={(e) => {
            e.stopPropagation();
            void openMenu();
          }}
        />
      </View>

      {/* 转发留言 */}
      {a.type === "repost" && a.repost_comment && (
        <Text className="repost-comment">{a.repost_comment}</Text>
      )}

      {/* 正文 */}
      {a.content && <Text className="content">{a.content}</Text>}

      {/* 图集 */}
      {a.photos?.length > 0 && <PhotoGrid photos={a.photos} onDeletePhoto={onDeletePhoto} />}

      {/* 商家链接卡片 */}
      {a.external_link && <LinkCard link={a.external_link} />}

      {/* 转发引用原文 */}
      {a.type === "repost" && a.repost_of && (
        <View className="repost-quote">
          <Text className="quote-author">@{a.repost_of.author?.nickname}</Text>
          {a.repost_of.content && (
            <Text className="quote-content">{a.repost_of.content}</Text>
          )}
          {a.repost_of.external_link && (
            <LinkCard link={a.repost_of.external_link} />
          )}
        </View>
      )}

      {/* 操作栏：图标 + 计数 */}
      <View className="card-actions">
        <View className="action-btn" onClick={handleLike}>
          <Image
            className="action-icon-img"
            src={a.is_liked ? "/assets/card-icons/heartFilled-coral.png" : "/assets/card-icons/heart-gray.png"}
            mode="aspectFit"
          />
          <Text className="action-count">{a.like_count || ""}</Text>
        </View>
        <View className="action-btn" onClick={handleComment}>
          <Image
            className="action-icon-img"
            src="/assets/card-icons/comment-gray.png"
            mode="aspectFit"
          />
          <Text className="action-count">{a.comment_count || ""}</Text>
        </View>
        <View className="action-btn" onClick={(e) => { e.stopPropagation(); void openRepost(); }}>
          <Image
            className="action-icon-img"
            src="/assets/card-icons/repost-gray.png"
            mode="aspectFit"
          />
          <Text className="action-count">转发</Text>
        </View>
        <Button className="action-btn share-btn" openType="share" plain>
          <Image
            className="action-icon-img"
            src="/assets/card-icons/share-gray.png"
            mode="aspectFit"
          />
          <Text className="action-count">分享</Text>
        </Button>
      </View>

      {/* 转发面板 */}
      {repostOpen && (
        <View className="card-panel" onClick={(e) => e.stopPropagation()}>
          <View className="panel-head">
            <Text className="panel-title">转发到饭搭子</Text>
            <Text className="panel-close" onClick={() => setRepostOpen(false)}>关闭</Text>
          </View>
          <Picker
            mode="selector"
            range={repostGroups.map((g) => g.name)}
            value={repostGroupIdx}
            onChange={(e) => setRepostGroupIdx(Number(e.detail.value))}
          >
            <View className="panel-picker">
              <Text>{repostGroups[repostGroupIdx]?.name ?? "选择饭搭子"}</Text>
              <Text className="panel-arrow">▾</Text>
            </View>
          </Picker>
          <Textarea
            className="panel-input"
            value={repostComment}
            placeholder="说点什么…（可选）"
            maxlength={500}
            autoHeight
            onInput={(e) => setRepostComment(e.detail.value)}
          />
          <View className="panel-actions">
            <Button size="mini" onClick={() => setRepostOpen(false)}>取消</Button>
            <Button
              size="mini"
              type="primary"
              loading={reposting}
              disabled={reposting}
              onClick={() => void submitRepost()}
            >
              转发
            </Button>
          </View>
        </View>
      )}

      {/* 举报面板 */}
      {reportOpen && (
        <View className="card-panel" onClick={(e) => e.stopPropagation()}>
          <View className="panel-head">
            <Text className="panel-title">举报打卡</Text>
            <Text className="panel-close" onClick={() => setReportOpen(false)}>关闭</Text>
          </View>
          <View className="report-reasons">
            {REPORT_REASONS.map((r) => (
              <Text
                key={r.key}
                className={`report-reason${reportReason === r.key ? " active" : ""}`}
                onClick={() => setReportReason(r.key)}
              >
                {r.label}
              </Text>
            ))}
          </View>
          <Textarea
            className="panel-input"
            value={reportDetail}
            placeholder="补充说明（可选）"
            maxlength={1000}
            autoHeight
            onInput={(e) => setReportDetail(e.detail.value)}
          />
          <View className="panel-actions">
            <Button size="mini" onClick={() => setReportOpen(false)}>取消</Button>
            <Button
              size="mini"
              type="primary"
              loading={reporting}
              disabled={reporting}
              onClick={() => void submitReport()}
            >
              提交
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
