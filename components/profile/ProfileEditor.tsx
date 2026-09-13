"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Link2, Loader2, LogOut, Mail, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUploader } from "@/components/common/AvatarUploader";
import { useAuthContext } from "@/lib/auth-context";
import { fetchData } from "@/lib/fetcher";
import type { Achievement, DecorItem, Profile } from "@/types";
import { NameBadges } from "@/components/profile/NameBadges";
import { WornBadges } from "@/components/profile/WornBadges";

/** /api/auth/qq/callback?bind_qq_error=xxx 错误码 → 中文提示 */
const BIND_ERROR_MESSAGES: Record<string, string> = {
  qq_not_configured: "服务端未配置 QQ 登录",
  qq_service_key_missing: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY",
  qq_state_invalid: "绑定状态校验失败，请重试",
  qq_token_failed: "QQ 授权码换取 access_token 失败",
  qq_no_access_token: "QQ 授权响应缺少 access_token",
  qq_me_failed: "QQ 用户身份获取失败",
  qq_no_openid: "QQ 用户身份缺失",
  qq_link_failed: "服务端写入 QQ openid 失败",
  qq_session_failed: "建立会话失败（绑定模式不应出现此错误）",
  qq_already_bound: "该 QQ 刚被其他账号绑定，请刷新后重试",
  session_expired: "登录已过期，请重新登录后再试",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 6;

export function ProfileEditor({
  profile,
  achievements = [],
  wornBadges = [],
  frameColor = null,
  qqEnabled = false,
  userEmail = null,
}: {
  profile: Profile;
  achievements?: Achievement[];
  /** 已佩戴的装扮徽章 */
  wornBadges?: DecorItem[];
  /** 头像框环色（hex） */
  frameColor?: string | null;
  /** QQ 登录是否启用（服务端判断后透传） */
  qqEnabled?: boolean;
  /** 当前账号邮箱（虚拟邮箱视为未绑定） */
  userEmail?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signOut: signOutAuth } = useAuthContext();
  const [nickname, setNickname] = useState(profile.nickname);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile.avatar_url ?? null
  );
  const [saving, setSaving] = useState(false);
  const [boundQqOpenid, setBoundQqOpenid] = useState<string | null>(
    profile.bound_qq_openid ?? null
  );
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [bindingEmail, setBindingEmail] = useState(false);

  // 处理 /api/auth/qq/callback 绑定回跳的 toast（?bind_qq=ok 或 ?bind_qq_error=xxx）
  useEffect(() => {
    const bindOk = searchParams.get("bind_qq");
    const bindErr = searchParams.get("bind_qq_error");
    const bindDebug = searchParams.get("bind_qq_debug");
    if (bindOk === "ok") {
      const newOpenid = searchParams.get("qq_openid");
      if (newOpenid) setBoundQqOpenid(newOpenid);
      toast.success("QQ 登录已绑定");
      // 清掉 query 参数
      const url = new URL(window.location.href);
      url.searchParams.delete("bind_qq");
      url.searchParams.delete("qq_openid");
      router.replace(url.pathname + url.search);
      router.refresh();
    } else if (bindErr) {
      const friendly = BIND_ERROR_MESSAGES[bindErr] ?? `绑定失败：${bindErr}`;
      const tail =
        bindDebug && (!BIND_ERROR_MESSAGES[bindErr] || friendly.startsWith("服务端"))
          ? ` · ${bindDebug}`
          : "";
      toast.error(`${friendly}${tail}`);
      const url = new URL(window.location.href);
      url.searchParams.delete("bind_qq_error");
      url.searchParams.delete("bind_qq_debug");
      router.replace(url.pathname + url.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!nickname.trim()) {
      toast.error("昵称不能为空");
      return;
    }
    setSaving(true);
    try {
      const updated = await fetchData<Profile>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          nickname: nickname.trim(),
          avatarUrl: avatarUrl || null,
        }),
      });
      if (updated.bound_qq_openid !== undefined) {
        setBoundQqOpenid(updated.bound_qq_openid);
      }
      toast.success("已保存");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    if (!confirm("确定退出登录吗？")) return;
    await signOutAuth();
  };

  const bindEmail = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      toast.error("邮箱格式不正确");
      return;
    }
    if (passwordInput.length < MIN_PASSWORD_LEN) {
      toast.error(`密码至少 ${MIN_PASSWORD_LEN} 位`);
      return;
    }
    setBindingEmail(true);
    try {
      await fetchData<{ ok: boolean }>("/api/profile/bind-email", {
        method: "POST",
        body: JSON.stringify({ email, password: passwordInput }),
      });
      if (userEmail && email === userEmail) {
        toast.success("密码已更新");
      } else {
        toast.success("已发送确认邮件，请到邮箱点击链接完成绑定");
      }
      setEmailInput("");
      setPasswordInput("");
      setShowEmailForm(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "绑定失败");
    } finally {
      setBindingEmail(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-md"
          />
          <AvatarUploader
            value={avatarUrl}
            nickname={nickname}
            onChange={setAvatarUrl}
            onPersist={async (url) => {
              // 头像选择/清除即落库，避免用户上传后未点"保存"导致丢失
              await fetchData<Profile>("/api/profile", {
                method: "PATCH",
                body: JSON.stringify({ avatarUrl: url }),
              });
              router.refresh();
            }}
            size={80}
            className="relative"
          />
          {frameColor ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                boxShadow: `inset 0 0 0 4px ${frameColor}, 0 0 0 1px rgba(0,0,0,0.06)`,
              }}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
          <p className="font-display text-lg font-semibold tracking-tight">{nickname}</p>
          {wornBadges.length > 0 ? <WornBadges badges={wornBadges} /> : null}
          <NameBadges achievements={achievements} />
        </div>
        <p className="text-xs text-muted-foreground">点击头像上传新图片</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nickname">昵称</Label>
        <Input
          id="nickname"
          name="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          autoComplete="nickname"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      {/* 第三方账号绑定 */}
      {qqEnabled ? (
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">QQ 登录</span>
                {boundQqOpenid ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    已绑定
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    未绑定
                  </span>
                )}
              </div>
              {boundQqOpenid ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  OpenID: {boundQqOpenid.slice(0, 8)}…{boundQqOpenid.slice(-4)}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  绑定后可用 QQ 一键登录，数据与本账号完全统一
                </p>
              )}
            </div>
            <a
              href={`/api/auth/qq?bind=1&redirect=${encodeURIComponent("/profile")}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#12B7F5] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-[#0FA3DC] hover:shadow-md active:scale-[0.98]"
            >
              <Link2 className="h-3.5 w-3.5" />
              {boundQqOpenid ? "换绑 QQ" : "绑定 QQ"}
            </a>
          </div>
        </div>
      ) : null}

      {/* 邮箱登录绑定 */}
      <div className="rounded-lg border border-border/60 bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">邮箱登录</span>
              {userEmail ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  已绑定
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  未绑定
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {userEmail
                ? "可用「邮箱 + 密码」登录本账号"
                : "绑定「邮箱 + 密码」后，QQ 转移时也能随时登录旧账号找回数据"}
            </p>
          </div>
          {userEmail && !showEmailForm ? (
            <button
              type="button"
              onClick={() => {
                setEmailInput(userEmail);
                setPasswordInput("");
                setShowEmailForm(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.98]"
            >
              更换
            </button>
          ) : null}
        </div>

        {!userEmail || showEmailForm ? (
          <div className="mt-2.5 space-y-2 border-t border-border/60 pt-2.5">
            <Input
              type="email"
              placeholder="邮箱地址"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
            <Input
              type="password"
              placeholder={`设置密码（至少 ${MIN_PASSWORD_LEN} 位）`}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoComplete="new-password"
            />
            <div className="flex items-center justify-between gap-2">
              {userEmail ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailForm(false);
                    setPasswordInput("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  取消
                </button>
              ) : (
                <span />
              )}
              <Button
                onClick={bindEmail}
                disabled={bindingEmail}
                size="sm"
                className="gap-1"
              >
                {bindingEmail ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                {userEmail ? "保存修改" : "绑定邮箱"}
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              提交后需前往邮箱点击确认链接，邮箱才会生效；密码即时生效。
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={signOut}
          className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/5"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </Button>
        <Button
          onClick={save}
          disabled={saving}
          className="shadow-sm transition-transform active:scale-[0.98]"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存
        </Button>
      </div>
    </div>
  );
}
