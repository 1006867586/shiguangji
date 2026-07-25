"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchData } from "@/lib/fetcher";
import type { Group } from "@/types";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("团体名称不能为空");
      return;
    }
    setSubmitting(true);
    try {
      const group = await fetchData<Group>("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
        }),
      });
      toast.success("团体创建成功");
      router.push(`/g/${group.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">团体名称 *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：室友的饭局"
          maxLength={30}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">团体简介（可选）</Label>
        <Textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="一句话介绍这个团体"
          rows={3}
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="avatar">团体头像 URL（可选）</Label>
        <Input
          id="avatar"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        创建后将自动生成 6 位邀请码，可分享给朋友加入。
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={submitting}>
          取消
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          创建团体
        </Button>
      </div>
    </div>
  );
}
