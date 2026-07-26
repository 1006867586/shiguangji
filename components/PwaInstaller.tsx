"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/** beforeinstallprompt 事件的最小类型定义（浏览器未内置 TS 类型） */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA 安装与 Service Worker 注册组件。
 * - 仅在生产环境且浏览器支持 serviceWorker 时注册 SW
 * - 监听 beforeinstallprompt，通过 sonner toast 提示用户安装
 * - 不渲染任何可见 UI（toast 自带视觉表现）
 */
export function PwaInstaller() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;

    // 1. 注册 Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[PWA] Service Worker 注册失败:", err);
      });
    }

    // 2. 监听安装提示
    let deferredPrompt: BeforeInstallPromptEvent | null = null;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      toast("安装飨刻到桌面", {
        description: "获得更流畅的全屏体验",
        action: {
          label: "安装",
          onClick: async () => {
            if (!deferredPrompt) return;
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
          },
        },
        cancel: {
          label: "稍后",
          onClick: () => {},
        },
        duration: 12000,
      });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  return null;
}
