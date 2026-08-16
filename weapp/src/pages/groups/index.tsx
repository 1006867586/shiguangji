import { useCallback, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Image, Button } from "@tarojs/components";
import { isLoggedIn } from "@/utils/auth";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import LoginGuide from "@/components/LoginGuide";
import {
  fetchGroups,
  createGroup,
  joinGroup,
  msgSecCheck,
  type GroupLite,
} from "@/utils/api";
import "./index.scss";

/**
 * 圈子页（TabBar）：我的圈子列表 + 创建 + 邀请码加入。
 * 卡片式布局，右上角悬浮 + 按钮快速创建。
 */
async function promptText(title: string, placeholder: string): Promise<string | null> {
  const res = await Taro.showModal({
    title,
    editable: true,
    placeholderText: placeholder,
  } as never);
  const r = res as { confirm: boolean; content?: string };
  return r.confirm ? (r.content ?? "") : null;
}

/** 圈子首字母渐变头像 fallback */
function getInitial(name: string): string {
  return name?.[0] || "圈";
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupLite[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchGroups();
      setGroups(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    setSelectedTab(1);
    if (isLoggedIn()) void load();
  });

  const handleCreate = async () => {
    if (creating) return;
    const input = await promptText("创建圈子", "给圈子起个名字（如：周五饭搭子）");
    if (input === null) return;
    const name = input.trim();
    if (!name) {
      Taro.showToast({ title: "名称不能为空", icon: "none" });
      return;
    }
    setCreating(true);
    try {
      // 内容安全前置检测（scene 1 资料类：圈名）
      try {
        const sec = await msgSecCheck(name, 1);
        if (!sec.pass) {
          Taro.showModal({
            title: "名称无法使用",
            content: sec.reason ?? "圈子名称包含违规信息，请修改后重试",
            showCancel: false,
          });
          return;
        }
      } catch {
        // 检测接口不可达：放行（服务端入库校验兜底）
      }
      const group = await createGroup({ name });
      Taro.showToast({ title: "创建成功", icon: "success" });
      await load();
      if (group?.id) {
        setTimeout(() => {
          Taro.navigateTo({ url: `/pages/group-detail/index?id=${group.id}` });
        }, 500);
      }
    } catch {
      // request 层已 toast
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const input = await promptText("加入圈子", "输入 6 位邀请码");
    if (input === null) return;
    const code = input.trim();
    if (!code) {
      Taro.showToast({ title: "请输入邀请码", icon: "none" });
      return;
    }
    try {
      await joinGroup(code);
      Taro.showToast({ title: "加入成功", icon: "success" });
      await load();
    } catch {
      // request 层已 toast
    }
  };

  const goDetail = (g: GroupLite) => {
    Taro.navigateTo({ url: `/pages/group-detail/index?id=${g.id}` });
  };

  if (!isLoggedIn()) {
    return (
      <View className="groups-page">
        <LoginGuide subtitle="登录后管理你的圈子" />
      </View>
    );
  }

  return (
    <View className="groups-page has-tabbar">
      {/* 顶部操作栏 */}
      <View className="top-bar">
        <Text className="page-title">圈子</Text>
        <View className="top-actions">
          <View className="action-btn join-btn" onClick={handleJoin}>
            <Text>邀请码</Text>
          </View>
          <View className="action-btn create-btn" onClick={handleCreate}>
            <Text className="create-icon">＋</Text>
          </View>
        </View>
      </View>

      {/* 圈子列表 */}
      {loading && groups === null && (
        <View className="state">
          <Text className="text-muted">加载中…</Text>
        </View>
      )}

      {groups && groups.length === 0 && (
        <View className="state">
          <Text className="state-emoji">🍽️</Text>
          <Text className="text-muted">还没有圈子，创建一个或用邀请码加入</Text>
        </View>
      )}

      <View className="circle-list">
        {groups?.map((g) => (
          <View key={g.id} className="circle-card" onClick={() => goDetail(g)}>
            <View className="card-head">
              {g.avatar_url ? (
                <Image
                  className="circle-icon"
                  src={g.avatar_url}
                  mode="aspectFill"
                />
              ) : (
                <View className="circle-icon gradient-icon">
                  <Text className="icon-text">{getInitial(g.name)}</Text>
                </View>
              )}
              <View className="circle-info">
                <View className="circle-name-row">
                  <Text className="circle-name">{g.name}</Text>
                  {g.role === "admin" && <Text className="role-badge">圈主</Text>}
                </View>
                <Text className="circle-members">
                  {g.invite_code ? `邀请码 ${g.invite_code}` : "点击查看详情"}
                </Text>
              </View>
            </View>
            {g.description && (
              <Text className="circle-desc">{g.description}</Text>
            )}
            <View className="circle-enter">
              <Text className="enter-text">进入圈子</Text>
              <Text className="enter-arrow">›</Text>
            </View>
          </View>
        ))}
      </View>

      {creating && (
        <View className="loading-mask">
          <Text className="text-muted">创建中…</Text>
        </View>
      )}
    </View>
  );
}
