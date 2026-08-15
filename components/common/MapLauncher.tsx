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
import { buildMapLinks, isApplePlatform } from "@/lib/map-links";

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
 * 采用官方 Web URI API：已装 App 时浏览器自动唤起（安卓 intent /
 * 鸿蒙 app linking / iOS Universal Link），未装时降级网页版。
 * Apple 地图入口仅在苹果移动设备显示（非苹果设备打开是错误页）。
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
        <DropdownMenuItem asChild>
          <a href={links.amap} target="_blank" rel="noopener noreferrer">
            高德地图
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={links.baidu} target="_blank" rel="noopener noreferrer">
            百度地图
          </a>
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
