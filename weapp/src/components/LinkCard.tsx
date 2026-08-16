import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ExternalLinkLite } from "@/utils/api";
import "./LinkCard.scss";

const PLATFORM_LABELS: Record<string, string> = {
  meituan: "美团",
  dianping: "大众点评",
  xiaohongshu: "小红书",
  douyin: "抖音",
  other: "链接",
};

/**
 * 商家链接卡片：封面 + 店名 + 评分/品类/地址/电话。
 * 地址行点击唤起微信内置地图（wx.openLocation，GCJ-02 坐标）；
 * 无坐标时降级复制地址文本。
 * 卡片其余区域点击复制外链（小程序无法直接打开外部商家页）。
 */
export default function LinkCard({ link }: { link: ExternalLinkLite }) {
  const platformLabel = PLATFORM_LABELS[link.platform] ?? "链接";

  const copyLink = () => {
    if (!link.url) return;
    Taro.setClipboardData({ data: link.url });
  };

  const handleAddress = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!link.address) return;
    const loc = link.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      Taro.openLocation({
        latitude: loc.lat,
        longitude: loc.lng,
        name: link.title || "店铺位置",
        address: link.address,
        scale: 16,
      });
    } else {
      // 历史数据无坐标：复制地址，用户可自行粘贴到地图 App
      Taro.setClipboardData({ data: link.address });
      Taro.showToast({ title: "地址已复制", icon: "none" });
    }
  };

  const handlePhone = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!link.phone) return;
    Taro.makePhoneCall({ phoneNumber: link.phone }).catch(() => {
      // 用户取消拨号
    });
  };

  return (
    <View className="link-card" onClick={copyLink}>
      <View className="link-body">
        <Text className="link-title">{link.title || "未知商家"}</Text>
        <View className="link-meta">
          {typeof link.rating === "number" && link.rating > 0 && (
            <Text className="link-rating">★ {link.rating.toFixed(1)}</Text>
          )}
          {link.category && <Text className="link-tag">{link.category}</Text>}
          {link.price && <Text className="link-price">{link.price}</Text>}
        </View>
        {link.address && (
          <View className="link-row link-row-tap" onClick={handleAddress}>
            <Text className="link-row-label">地址</Text>
            <Text className="link-row-value">{link.address}</Text>
            <Text className="link-row-icon">📍</Text>
          </View>
        )}
        {link.phone && (
          <View className="link-row link-row-tap" onClick={handlePhone}>
            <Text className="link-row-label">电话</Text>
            <Text className="link-row-value">{link.phone}</Text>
            <Text className="link-row-icon">📞</Text>
          </View>
        )}
      </View>
      {link.coverImage && (
        <Image
          className="link-cover"
          src={link.coverImage}
          mode="aspectFill"
          lazyLoad
        />
      )}
      <View className="link-footer">
        <Text className="link-platform">{platformLabel}</Text>
        <Text className="link-copy-hint">点击复制链接</Text>
      </View>
    </View>
  );
}
