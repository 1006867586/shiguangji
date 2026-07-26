"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AvatarUploader } from "@/components/common/AvatarUploader";
import { useGroupSettings } from "@/hooks/useGroupSettings";
import { cn } from "@/lib/utils";
import type { Group } from "@/types";

interface GroupSettingsFormProps {
  group: Group;
}

/** 内联开关（项目暂无 Switch 组件，用 button + role=switch 模拟） */
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/**
 * GroupSettingsForm — 团体设置表单。
 * 编辑头像/名称/简介/邀请码/设置开关；保存调用 updateGroup。
 */
export function GroupSettingsForm({ group }: GroupSettingsFormProps) {
  const router = useRouter();
  const { update, resetInviteCode, loading } = useGroupSettings(group.id);

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(group.avatar_url);
  const [inviteCode, setInviteCode] = useState(group.invite_code);
  const [settings, setSettings] = useState({
    join_approval: group.settings?.join_approval ?? false,
    allow_member_pin: group.settings?.allow_member_pin ?? false,
    allow_video: group.settings?.allow_video ?? false,
  });

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("团体名称不能为空");
      return;
    }
    try {
      // 注意：API 对 settings 为整体替换，故每次都传完整 settings 对象
      await update({
        name: trimmedName,
        description: description.trim() || null,
        avatarUrl,
        settings: {
          join_approval: settings.join_approval,
          allow_member_pin: settings.allow_member_pin,
          allow_video: settings.allow_video,
        },
      });
      toast.success("已保存");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleResetInviteCode = async () => {
    if (!confirm("确定重置邀请码吗？旧邀请码将立即失效。")) return;
    try {
      const newCode = await resetInviteCode();
      setInviteCode(newCode);
      toast.success("邀请码已重置");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重置失败");
    }
  };

  return (
    <div className="space-y-5 p-4">
      {/* 头像 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <AvatarUploader
          value={avatarUrl}
          nickname={name || "团体"}
          onChange={setAvatarUrl}
          size={80}
        />
      </section>

      {/* 基本信息 */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="group-name">团体名称</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="输入团体名称"
          />
          <p className="text-xs text-muted-foreground">
            {name.length}/50
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-desc">团体简介</Label>
          <Textarea
            id="group-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="介绍一下这个团体（选填）"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {description.length}/500
          </p>
        </div>
      </section>

      {/* 邀请码 */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label>邀请码</Label>
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm tracking-[0.3em]">
              {inviteCode}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetInviteCode}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              重置
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            分享邀请码或链接让朋友加入团体
          </p>
        </div>
      </section>

      {/* 设置开关 */}
      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <SettingRow
          title="允许成员置顶活动"
          description="成员可将自己发布的活动置顶"
          checked={settings.allow_member_pin}
          onChange={(v) =>
            setSettings((s) => ({ ...s, allow_member_pin: v }))
          }
        />
        <Separator className="my-1" />
        <SettingRow
          title="允许视频上传"
          description="成员可上传视频作为活动照片"
          checked={settings.allow_video}
          onChange={(v) => setSettings((s) => ({ ...s, allow_video: v }))}
        />
        <Separator className="my-1" />
        <SettingRow
          title="加入需审批"
          description="新成员通过邀请码加入时需管理员审批（即将推出）"
          checked={settings.join_approval}
          onChange={(v) =>
            setSettings((s) => ({ ...s, join_approval: v }))
          }
        />
      </section>

      {/* 保存按钮 */}
      <Button
        type="button"
        className="w-full"
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        保存设置
      </Button>
    </div>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
