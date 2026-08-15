"use client";

import { useMemo } from "react";
import { Navigation, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  buildMapLinks,
  isApplePlatform,
  openMapApp,
  type MapProvider,
} from "@/lib/map-links";

interface MapLauncherProps {
  name?: string | null;
  address?: string | null;
  /** 城市名，限定检索范围减少异地同名店误匹配 */
  city?: string | null;
  /** 触发器内容（地址文本等），点击弹出地图选择菜单 */
  children: React.ReactNode;
}

/**
 * 点击地址唤起地图 App（安卓/鸿蒙/iOS 三平台）。
 *
 * 优先通过原生 scheme / intent 直接唤起 App（安卓 intent 自带未装降级、
 * iOS 失焦检测 + 网页版兜底）；微信内 scheme 被屏蔽，提示用浏览器打开；
 * 名称地址均缺时不渲染菜单，直接透传 children。
 */
export function MapLauncher({
  name,
  address,
  city,
  children,
}: MapLauncherProps) {
  const links = useMemo(
    () => buildMapLinks({ name, address, city }),
    [name, address, city]
  );

  const showApple = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      isApplePlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    []
  );

  const handleOpen = (provider: MapProvider) => {
    const result = openMapApp(provider, { name, address, city });
    if (result === "wechat") {
      toast.info(
        "微信内无法直接唤起地图App，已打开网页版；如需唤起App，请点右上角『···』选择「在浏览器打开」"
      );
    } else if (result === "app") {
      toast.info("正在唤起地图App，未安装将打开网页版");
    }
  };

  if (!links) return <>{children}</>;

  const handleCopy = async () => {
    const text = [name, address].filter(Boolean).join(" ");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制地址");
    } catch {
      toast.error("复制失败，请手动选择");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        onClick={(e) => {
          // 阻止冒泡：嵌在链接卡片内时不触发卡片本身的跳转
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <span
          role="button"
          tabIndex={0}
          title="点击唤起地图导航"
          className="inline-flex cursor-pointer items-center gap-0.5 underline-offset-2 hover:underline"
        >
          {children}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          <Navigation className="mr-1 inline h-3 w-3" aria-hidden="true" />
          选择地图打开
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => handleOpen("amap")}>
          高德地图
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleOpen("baidu")}>
          百度地图
        </DropdownMenuItem>
        {showApple ? (
          <DropdownMenuItem asChild>
            <a href={links.apple} target="_blank" rel="noopener noreferrer">
              Apple 地图
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleCopy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          复制名称与地址
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
