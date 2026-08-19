"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUploader } from "@/components/common/AvatarUploader";
import { useAuthContext } from "@/lib/auth-context";
import { fetchData } from "@/lib/fetcher";
import type { Achievement, Profile } from "@/types";
import { NameBadges } from "@/components/profile/NameBadges";

export function ProfileEditor({
  profile,
  achievements = [],
}: {
  profile: Profile;
  achievements?: Achievement[];
}) {
  const router = useRouter();
  const { signOut: signOutAuth } = useAuthContext();
  const [nickname, setNickname] = useState(profile.nickname);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile.avatar_url ?? null
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!nickname.trim()) {
      toast.error("昵称不能为空");
      return;
    }
    setSaving(true);
    try {
      await fetchData<Profile>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          nickname: nickname.trim(),
          avatarUrl: avatarUrl || null,
        }),
      });
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
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
          <p className="font-display text-lg font-semibold tracking-tight">{nickname}</p>
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
