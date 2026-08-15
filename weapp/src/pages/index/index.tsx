import { useEffect, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { request, ApiError } from "@/utils/request";
import { isLoggedIn } from "@/utils/auth";
import "./index.scss";

/**
 * 动态页（TabBar 首页）— Phase 1 仅承载 M1 验收：
 * Bearer 通道调通受保护接口（/api/groups），正式 feed 流 M2 实现。
 */

interface GroupLite {
  id: string;
  name: string;
  invite_code?: string;
}

export default function IndexPage() {
  const [groups, setGroups] = useState<GroupLite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!isLoggedIn()) {
      setError("未登录");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await request<GroupLite[]>("/api/groups", { silent: true });
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useDidShow(() => {
    // 从登录页返回后重新拉取
    if (isLoggedIn() && groups === null) void load();
  });

  if (!isLoggedIn()) {
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

  return (
    <View className="page">
      <View className="card">
        <Text className="section-title">M1 · Bearer 通道验证</Text>
        {loading && <Text className="text-muted">加载中…</Text>}
        {error && (
          <View>
            <Text className="error">{error}</Text>
            <Button size="mini" onClick={() => void load()}>
              重试
            </Button>
          </View>
        )}
        {groups && groups.length === 0 && (
          <Text className="text-muted">还没有圈子（Web 端创建后此处可见）</Text>
        )}
        {groups?.map((g) => (
          <View key={g.id} className="group-item">
            <Text>{g.name}</Text>
            {g.invite_code && <Text className="text-muted">邀请码 {g.invite_code}</Text>}
          </View>
        ))}
      </View>
      <View className="card">
        <Text className="text-muted">动态流（feed）将在 M2 上线：按圈子聚合的活动时间线。</Text>
      </View>
    </View>
  );
}
