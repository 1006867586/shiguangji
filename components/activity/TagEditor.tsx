"use client";

import { useEffect, useState } from "react";
import { Pencil, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useActivityTags, setActivityTags } from "@/hooks/useTags";
import type { Tag } from "@/types";

interface TagEditorProps {
  activityId: string;
  /** 是否可编辑（默认 true） */
  editable?: boolean;
  /** 初始标签（来自 Activity.tags，避免首屏空白） */
  initialTags?: Tag[];
}

/**
 * TagEditor — 活动标签编辑组件。
 * 展示当前标签（badge 形式），点击编辑按钮切换为输入框，
 * 输入逗号分隔的标签名，保存时调用 setActivityTags PUT 替换。
 */
export function TagEditor({
  activityId,
  editable = true,
  initialTags,
}: TagEditorProps) {
  const { tags, setTags } = useActivityTags(activityId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // 首屏回退到 initialTags
  const displayTags = tags.length > 0 ? tags : initialTags ?? [];

  // 进入编辑模式时，把当前标签名填入输入框
  useEffect(() => {
    if (editing) {
      setDraft(displayTags.map((t) => t.name).join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const save = async () => {
    const names = draft
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    // 乐观更新本地缓存
    const optimistic: Tag[] = names.map((name, i) => ({
      id: `optimistic-${i}`,
      group_id: "",
      name,
      created_at: new Date().toISOString(),
    }));
    setTags(optimistic);
    try {
      const saved = await setActivityTags(activityId, names);
      setTags(saved);
      toast.success(`已保存 ${saved.length} 个标签`);
      setEditing(false);
    } catch (e) {
      // 回滚：重新拉取
      toast.error(e instanceof Error ? e.message : "保存失败");
      setTags(initialTags ?? []);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setEditing(false);
    setDraft("");
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="输入标签，用逗号分隔，如：聚餐, 周末"
          aria-label="编辑标签"
          name="tags"
          autoComplete="off"
          autoFocus
          spellCheck={false}
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
          className="h-8 flex-1 text-sm"
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          onClick={cancel}
          disabled={saving}
        >
          取消
        </Button>
        <Button
          size="sm"
          className="h-8"
          onClick={save}
          disabled={saving || !draft.trim()}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "保存"
          )}
        </Button>
      </div>
    );
  }

  if (displayTags.length === 0 && !editable) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {displayTags.map((t) => (
        <Badge key={t.id} variant="secondary" className="text-[11px]">
          #{t.name}
        </Badge>
      ))}
      {displayTags.length === 0 ? (
        <span className="text-xs text-muted-foreground">暂无标签</span>
      ) : null}
      {editable ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs text-muted-foreground"
          onClick={() => setEditing(true)}
          aria-label="编辑标签"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          {displayTags.length === 0 ? "添加标签" : "编辑"}
        </Button>
      ) : null}
    </div>
  );
}

/** 标签展示用，X 按钮预留给后续删除单标签 */
export function TagBadge({
  tag,
  onRemove,
}: {
  tag: Tag;
  onRemove?: () => void;
}) {
  return (
    <Badge variant="secondary" className="text-[11px]">
      #{tag.name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`移除标签 ${tag.name}`}
          className="ml-1 rounded-full hover:bg-background/60"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </Badge>
  );
}
