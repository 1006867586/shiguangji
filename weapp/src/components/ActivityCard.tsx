import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ActivityLite } from "@/utils/api";
import { formatRelativeTime } from "@/utils/time";
import PhotoGrid from "./PhotoGrid";
import LinkCard from "./LinkCard";
import "./ActivityCard.scss";

interface Props {
  activity: ActivityLite;
  /** 点赞回调（乐观更新由页面处理） */
  onLike?: (a: ActivityLite) => void;
  /** 卡片点击进详情（操作按钮区域点击不触发） */
  onTap?: (a: ActivityLite) => void;
}

/** 动态卡片：作者 + 内容 + 图集 + 链接 + 转发引用 + 操作栏 */
export default function ActivityCard({ activity, onLike, onTap }: Props) {
  const a = activity;

  const goDetail = () => onTap?.(a);

  const handleLike = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onLike?.(a);
  };

  const handleComment = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    Taro.navigateTo({ url: `/pages/detail/index?id=${a.id}` });
  };

  const avatar = a.author?.avatar_url || "https://img.example.com/avatar-default.png";

  return (
    <View className="activity-card" onClick={goDetail}>
      {/* 头部：头像 + 昵称 + 时间 */}
      <View className="card-header">
        <Image className="avatar" src={avatar} mode="aspectFill" />
        <View className="header-main">
          <Text className="nickname">{a.author?.nickname || "饭友"}</Text>
          <Text className="time">{formatRelativeTime(a.created_at)}</Text>
        </View>
        {a.type === "repost" && <Text className="repost-badge">转发</Text>}
      </View>

      {/* 转发评论 */}
      {a.type === "repost" && a.repost_comment && (
        <Text className="repost-comment">{a.repost_comment}</Text>
      )}

      {/* 正文 */}
      {a.content && <Text className="content">{a.content}</Text>}

      {/* 图集 */}
      {a.photos?.length > 0 && <PhotoGrid photos={a.photos} />}

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

      {/* 操作栏 */}
      <View className="card-actions">
        <View className="action-btn" onClick={handleLike}>
          <Text className={a.is_liked ? "action-icon liked" : "action-icon"}>
            {a.is_liked ? "♥" : "♡"}
          </Text>
          <Text className="action-count">{a.like_count || ""}</Text>
        </View>
        <View className="action-btn" onClick={handleComment}>
          <Text className="action-icon">💬</Text>
          <Text className="action-count">{a.comment_count || ""}</Text>
        </View>
      </View>
    </View>
  );
}
