import { useCallback, useState } from "react";
import Taro, { useDidShow, useShareAppMessage } from "@tarojs/taro";
import { View, Text, Image, Button } from "@tarojs/components";
import {
  fetchGroups,
  fetchGroupMembers,
  type GroupLite,
  type GroupMemberLite,
} from "@/utils/api";
import "./index.scss";

/**
 * 圈子详情：基本信息 + 邀请码（复制 / 转发拉人）+ 成员列表。
 * useShareAppMessage 转发卡片带邀请码，好友点开可进小程序加入。
 */
export default function GroupDetailPage() {
  const [groupId, setGroupId] = useState("");
  const [group, setGroup] = useState<GroupLite | null>(null);
  const [members, setMembers] = useState<GroupMemberLite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [list, ms] = await Promise.all([
        fetchGroups(),
        fetchGroupMembers(id),
      ]);
      setGroup(list.find((g) => g.id === id) ?? null);
      setMembers(ms ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    const id = Taro.getCurrentInstance().router?.params?.id ?? "";
    if (id && id !== groupId) {
      setGroupId(id);
      void load(id);
    }
  });

  // 转发卡片：标题带圈子名，path 指向动态页并带邀请码参数
  useShareAppMessage(() => {
    const name = group?.name ?? "想聚";
    return {
      title: `邀请你加入「${name}」一起记录饭局`,
      path: `/pages/index/index?inviteCode=${group?.invite_code ?? ""}`,
    };
  });

  const copyInviteCode = () => {
    if (!group?.invite_code) return;
    Taro.setClipboardData({ data: group.invite_code });
  };

  if (loading && !group) {
    return (
      <View className="gd-page state">
        <Text className="text-muted">加载中…</Text>
      </View>
    );
  }

  if (!group) {
    return (
      <View className="gd-page state">
        <Text className="text-muted">圈子不存在或已退出</Text>
      </View>
    );
  }

  return (
    <View className="gd-page">
      {/* 基本信息 + 邀请码 */}
      <View className="gd-card info-card">
        <View className="info-main">
          <Image
            className="gd-avatar"
            src={group.avatar_url || "https://img.example.com/group-default.png"}
            mode="aspectFill"
          />
          <View className="info-text">
            <View className="name-row">
              <Text className="gd-name">{group.name}</Text>
              {group.role === "admin" && <Text className="role-badge">圈主</Text>}
            </View>
            {group.description && (
              <Text className="gd-desc">{group.description}</Text>
            )}
            <Text className="gd-member-count">{members.length} 位成员</Text>
          </View>
        </View>

        <View className="invite-row">
          <View className="invite-code-box">
            <Text className="invite-label">邀请码</Text>
            <Text className="invite-code">{group.invite_code}</Text>
          </View>
          <Button size="mini" onClick={copyInviteCode}>
            复制
          </Button>
          <Button size="mini" type="primary" openType="share">
            微信拉人
          </Button>
        </View>
      </View>

      {/* 成员列表 */}
      <View className="gd-card">
        <Text className="section-title">成员</Text>
        {members.map((m) => (
          <View key={m.id} className="member-item">
            <Image
              className="member-avatar"
              src={
                m.profile?.avatar_url ||
                "https://img.example.com/avatar-default.png"
              }
              mode="aspectFill"
            />
            <Text className="member-name">{m.profile?.nickname || "饭友"}</Text>
            {m.role === "admin" && <Text className="role-badge">圈主</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}
