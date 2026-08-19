import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getSelectedTab, subscribeTab } from "./tabStore";
import { TAB_ICONS } from "./icons";
import "./index.scss";

interface TabItem {
  key: string;
  pagePath: string;
  text: string;
  icon: "home" | "wheel" | "user";
}

const TABS: TabItem[] = [
  { key: "favorites", pagePath: "/pages/index/index", text: "收藏", icon: "home" },
  { key: "roulette", pagePath: "/pages/roulette/index", text: "转盘", icon: "wheel" },
  { key: "profile", pagePath: "/pages/profile/index", text: "我的", icon: "user" },
];

function Icon({ name, active }: { name: TabItem["icon"]; active: boolean }) {
  const key = active ? `${name}_white` : `${name}_gray`;
  const src = TAB_ICONS[key];
  return (
    <Image
      className="tab-icon-img"
      src={src}
      mode="aspectFit"
      style={{ width: "52rpx", height: "52rpx" }}
    />
  );
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
          className={`tab-item${selected === i ? " active" : ""}`}
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
