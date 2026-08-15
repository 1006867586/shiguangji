import { useCallback, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Image, Button } from "@tarojs/components";
import { isLoggedIn } from "@/utils/auth";
import {
  fetchGroups,
  createGroup,
  joinGroup,
  type GroupLite,
} from "@/utils/api";
import "./index.scss";

/**
 * 带输入框的确认弹窗（wx.showModal editable，Taro 4 类型未收录，需断言）。
 * resolve(content)；用户取消 resolve(null)。
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

/**
 * 圈子管理页：我的圈子列表 + 创建 + 邀请码加入。
 * 创建成功后自动跳转该圈子详情（可复制邀请码拉人）。
 */
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
    if (isLoggedIn()) void load();
  });

  // ---- 创建圈子（promptText 输入名称） ----
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

  // ---- 邀请码加入 ----
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
      // request 层已 toast（邀请码无效等）
    }
  };

  const goDetail = (g: GroupLite) => {
    Taro.navigateTo({ url: `/pages/group-detail/index?id=${g.id}` });
  };

  if (!isLoggedIn()) {
    return (
      <View className="groups-page placeholder">
        <Text className="text-muted">登录后管理你的圈子</Text>
        <Button
          type="primary"
          onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
        >
          去登录
        </Button>
      </View>
    );
  }

  return (
    <View className="groups-page">
      {/* 操作区 */}
      <View className="action-bar">
        <Button size="mini" type="primary" onClick={handleCreate} loading={creating}>
          ＋ 创建圈子
        </Button>
        <Button size="mini" onClick={handleJoin}>
          邀请码加入
        </Button>
      </View>

      {/* 列表 */}
      {loading && groups === null && (
        <View className="state">
          <Text className="text-muted">加载中…</Text>
        </View>
      )}

      {groups && groups.length === 0 && (
        <View className="state">
          <Text className="text-muted">还没有圈子，创建一个或用邀请码加入</Text>
        </View>
      )}

      {groups?.map((g) => (
        <View key={g.id} className="group-card" onClick={() => goDetail(g)}>
          <Image
            className="group-avatar"
            src={g.avatar_url || "https://img.example.com/group-default.png"}
            mode="aspectFill"
          />
          <View className="group-info">
            <View className="group-name-row">
              <Text className="group-name">{g.name}</Text>
              {g.role === "admin" && <Text className="role-badge">圈主</Text>}
            </View>
            {g.description && (
              <Text className="group-desc">{g.description}</Text>
            )}
            {g.invite_code && (
              <Text className="group-code">邀请码 {g.invite_code}</Text>
            )}
          </View>
          <Text className="arrow">›</Text>
        </View>
      ))}
    </View>
  );
}
