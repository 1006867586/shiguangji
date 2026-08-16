import { useCallback, useState } from "react";
import Taro, { useDidShow, useShareAppMessage } from "@tarojs/taro";
import { View, Text, Image, Button } from "@tarojs/components";
import {
  fetchGroups,
  fetchGroupMembers,
  leaveGroup,
  transferGroupAdmin,
  removeGroupMember,
  type GroupLite,
  type GroupMemberLite,
} from "@/utils/api";
import { getCurrentUserId } from "@/utils/auth";
import "./index.scss";

/**
 * 圈子详情：基本信息 + 邀请码（复制 / 转发拉人）+ 成员列表。
 * 圈主可转让管理员 / 移除成员；所有成员可退出圈子。
 */
export default function GroupDetailPage() {
  const [groupId, setGroupId] = useState("");
  const [group, setGroup] = useState<GroupLite | null>(null);
  const [members, setMembers] = useState<GroupMemberLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const currentUserId = getCurrentUserId();
  const isAdmin = group?.role === "admin";

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

  // ---- 退出圈子 ----
  const handleLeave = async () => {
    if (busy || !groupId) return;
    const m = await Taro.showModal({
      title: "退出圈子",
      content: `确定退出「${group?.name ?? "该圈子"}」？退出后需邀请码才能重新加入。`,
      confirmColor: "#ef4444",
    });
    if (!m.confirm) return;
    setBusy(true);
    try {
      await leaveGroup(groupId);
      Taro.showToast({ title: "已退出", icon: "success" });
      setTimeout(() => Taro.switchTab({ url: "/pages/groups/index" }), 600);
    } catch {
      // request 层已 toast（唯一管理员会被拦截提示）
    } finally {
      setBusy(false);
    }
  };

  // ---- 转让管理员 ----
  const handleTransfer = async (member: GroupMemberLite) => {
    if (busy || !groupId) return;
    const m = await Taro.showModal({
      title: "转让圈主",
      content: `确定将圈主转让给「${member.profile?.nickname || "该成员"}」？转让后你将成为普通成员。`,
      confirmColor: "#ff6b35",
    });
    if (!m.confirm) return;
    setBusy(true);
    try {
      await transferGroupAdmin(groupId, member.user_id);
      Taro.showToast({ title: "转让成功", icon: "success" });
      await load(groupId);
    } catch {
      // request 层已 toast
    } finally {
      setBusy(false);
    }
  };

  // ---- 移除成员 ----
  const handleRemove = async (member: GroupMemberLite) => {
    if (busy || !groupId) return;
    const m = await Taro.showModal({
      title: "移除成员",
      content: `确定将「${member.profile?.nickname || "该成员"}」移出圈子？`,
      confirmColor: "#ef4444",
    });
    if (!m.confirm) return;
    setBusy(true);
    try {
      await removeGroupMember(groupId, member.user_id);
      Taro.showToast({ title: "已移除", icon: "success" });
      await load(groupId);
    } catch {
      // request 层已 toast
    } finally {
      setBusy(false);
    }
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

        {/* 今天吃什么转盘（分包页面） */}
        <View
          className="roulette-entry"
          onClick={() =>
            Taro.navigateTo({
              url: `/subpackages/roulette/index?groupId=${group.id}`,
            })
          }
        >
          <Text className="roulette-entry-icon">🎡</Text>
          <View className="roulette-entry-main">
            <Text className="roulette-entry-title">今天吃什么</Text>
            <Text className="roulette-entry-sub">转盘选店，告别选择困难</Text>
          </View>
          <Text className="arrow">›</Text>
        </View>
      </View>

      {/* 成员列表 */}
      <View className="gd-card">
        <Text className="section-title">成员</Text>
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          return (
            <View key={m.id} className="member-item">
              <Image
                className="member-avatar"
                src={
                  m.profile?.avatar_url ||
                  "https://img.example.com/avatar-default.png"
                }
                mode="aspectFill"
              />
              <Text className="member-name">
                {m.profile?.nickname || "饭友"}
                {isSelf ? "（我）" : ""}
              </Text>
              {m.role === "admin" && <Text className="role-badge">圈主</Text>}
              {/* 圈主对非圈主成员的管理操作 */}
              {isAdmin && m.role !== "admin" && (
                <View className="member-actions">
                  <Text
                    className="member-action transfer"
                    onClick={() => void handleTransfer(m)}
                  >
                    转让
                  </Text>
                  <Text
                    className="member-action remove"
                    onClick={() => void handleRemove(m)}
                  >
                    移除
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* 退出圈子 */}
      <View className="gd-leave">
        <Button
          className="leave-btn"
          loading={busy}
          disabled={busy}
          onClick={() => void handleLeave()}
        >
          退出圈子
        </Button>
      </View>
    </View>
  );
}
