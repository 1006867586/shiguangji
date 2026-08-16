import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getSelectedTab, subscribeTab } from "./tabStore";
import "./index.scss";

interface TabItem {
  key: string;
  pagePath: string;
  text: string;
  icon: "home" | "groups" | "plus" | "wheel" | "user";
  center?: boolean;
}

const TABS: TabItem[] = [
  { key: "index", pagePath: "/pages/index/index", text: "动态", icon: "home" },
  { key: "groups", pagePath: "/pages/groups/index", text: "圈子", icon: "groups" },
  { key: "publish", pagePath: "/pages/publish/index", text: "发布", icon: "plus", center: true },
  { key: "roulette", pagePath: "/pages/roulette/index", text: "转盘", icon: "wheel" },
  { key: "profile", pagePath: "/pages/profile/index", text: "我的", icon: "user" },
];

function Icon({ name, active }: { name: TabItem["icon"]; active: boolean }) {
  const color = active ? "#FF6B35" : "#9CA3AF";
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24">
          <path {...common} d="M3 11.5 12 4l9 7.5" />
          <path {...common} d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case "groups":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3" {...common} />
          <path {...common} d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path {...common} d="M16 6.2a3 3 0 0 1 0 5.6" />
          <path {...common} d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
        </svg>
      );
    case "plus":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24">
          <path stroke="#fff" strokeWidth={2.4} strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
      );
    case "wheel":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" {...common} />
          <path {...common} d="M12 3v9l7.8 4.5" />
          <circle cx="12" cy="12" r="1.6" fill={color} />
        </svg>
      );
    case "user":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.4" {...common} />
          <path {...common} d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    default:
      return null;
  }
}

export default function CustomTabBar() {
  const [selected, setSelected] = useState<number>(getSelectedTab());

  useEffect(() => subscribeTab(setSelected), []);

  const handleTap = (t: TabItem, index: number) => {
    if (getSelectedTab() === index) return;
    Taro.switchTab({ url: t.pagePath });
  };

  return (
    <View className="custom-tab-bar">
      {TABS.map((t, i) => (
        <View
          key={t.key}
          className={`tab-item${t.center ? " tab-center" : ""}${selected === i ? " active" : ""}`}
          onClick={() => handleTap(t, i)}
        >
          <View className="tab-icon">
            <Icon name={t.icon} active={selected === i} />
          </View>
          <Text className="tab-label">{t.text}</Text>
        </View>
      ))}
    </View>
  );
}
