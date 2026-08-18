"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type QrState = "generating" | "waiting" | "polling" | "success" | "expired" | "error";

interface WechatQrLoginProps {
  open: boolean;
  onClose: () => void;
  redirect: string;
}

/**
 * 微信扫码登录弹窗：
 * 生成小程序码（POST /api/auth/weapp/qrcode）→ 展示二维码
 * → 长轮询 POST /api/auth/weapp/login-status（pending 续发）
 * → ok 时服务端已写 cookie，硬跳 redirect。
 */
export function WechatQrLogin({ open, onClose, redirect }: WechatQrLoginProps) {
  const [state, setState] = useState<QrState>("generating");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const uuidRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
  }, []);

  const refresh = useCallback(() => {
    stoppedRef.current = false;
    uuidRef.current = null;
    setQrBase64(null);
    setErrorMsg(null);
    setState("generating");
    setRefreshNonce((n) => n + 1);
  }, []);

  // 生成二维码
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/weapp/qrcode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const info = (await res.json().catch(() => ({}))) as {
          data?: { uuid: string; qrBase64: string };
          error?: string;
          code?: string;
        };
        if (cancelled || stoppedRef.current) return;
        if (!res.ok || !info.data) {
          setErrorMsg(
            info.code === "weapp_not_configured"
              ? "服务端未配置小程序登录，请联系管理员"
              : info.error || "生成二维码失败"
          );
          setState("error");
          return;
        }
        uuidRef.current = info.data.uuid;
        setQrBase64(info.data.qrBase64);
        setState("waiting");
        // 教程：延迟 5 秒开始轮询，给用户扫码时间
        setTimeout(() => {
          if (!cancelled && !stoppedRef.current) setState("polling");
        }, 5000);
      } catch {
        if (!cancelled && !stoppedRef.current) {
          setErrorMsg("生成二维码失败，请重试");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshNonce]);

  // 长轮询登录结果（每次最多 ~20s，pending 则间隔 1s 续发）
  useEffect(() => {
    if (!open || state !== "polling") return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || stoppedRef.current) return;
      try {
        const res = await fetch("/api/auth/weapp/login-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uuid: uuidRef.current, redirect }),
        });
        const info = (await res.json().catch(() => ({}))) as {
          status?: string;
          redirect?: string;
          error?: string;
        };
        if (cancelled || stoppedRef.current) return;
        if (info.status === "ok") {
          setState("success");
          // 会话 cookie 已由服务端写入，硬跳完成登录
          window.location.href = info.redirect ?? redirect;
        } else if (info.status === "expired") {
          setState("expired");
        } else if (info.status === "pending") {
          setTimeout(poll, 1000);
        } else {
          setErrorMsg(info.error || "登录状态查询失败");
          setState("error");
        }
      } catch {
        if (!cancelled && !stoppedRef.current) {
          setTimeout(poll, 2000); // 网络抖动重试
        }
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state, redirect]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">微信扫码登录</DialogTitle>
          <DialogDescription className="text-center">
            使用微信扫一扫，在小程序中确认登录
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {state === "generating" || state === "waiting" || state === "polling" ? (
            <>
              <div className="flex h-56 w-56 items-center justify-center rounded-xl border bg-white p-2">
                {qrBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/png;base64,${qrBase64}`}
                    alt="微信登录二维码"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {state === "generating"
                  ? "正在生成二维码…"
                  : state === "waiting"
                    ? "请使用微信扫一扫"
                    : "已扫码，等待手机确认…"}
              </p>
            </>
          ) : state === "expired" ? (
            <>
              <p className="text-sm text-muted-foreground">二维码已失效，请刷新后重试</p>
              <Button type="button" onClick={refresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新二维码
              </Button>
            </>
          ) : state === "error" ? (
            <>
              <p className="text-sm text-destructive">{errorMsg ?? "出错了"}</p>
              <Button type="button" variant="outline" onClick={refresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重试
              </Button>
            </>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-3 top-3 h-7 w-7 p-0"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
