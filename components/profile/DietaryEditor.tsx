"use client";

import { useState } from "react";
import { Check, Loader2, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchData } from "@/lib/fetcher";
import { DIETARY_TAGS } from "@/lib/dietary";

const MAX_NOTE_LENGTH = 200;

/**
 * 忌口偏好编辑器。
 *
 * 交互取舍：勾选标签即时落库（乐观更新 + 失败回滚），说明文字单独点保存。
 * 理由：标签是高频、离散、低风险的点击操作，每点一次都要按保存太烦；
 * 而说明文字可能较长且用户会反复修改，即时保存会在输入过程中反复写库。
 */
export function DietaryEditor({
  initialTags = [],
  initialNote = null,
}: {
  initialTags?: string[];
  initialNote?: string | null;
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [note, setNote] = useState(initialNote ?? "");
  const [savedNote, setSavedNote] = useState(initialNote ?? "");
  const [savingNote, setSavingNote] = useState(false);

  const noteDirty = note.trim() !== savedNote.trim();

  const persist = async (nextTags: string[], nextNote: string | null) => {
    await fetchData<{ dietary_tags: string[]; dietary_note: string | null }>(
      "/api/profile/dietary",
      {
        method: "PATCH",
        body: JSON.stringify({ dietaryTags: nextTags, dietaryNote: nextNote }),
      }
    );
  };

  const toggleTag = async (key: string) => {
    const prev = tags;
    const next = prev.includes(key)
      ? prev.filter((t) => t !== key)
      : [...prev, key];
    setTags(next); // 乐观更新：点击立刻有反馈
    try {
      await persist(next, savedNote.trim() || null);
    } catch (e) {
      setTags(prev); // 回滚到点击前，避免 UI 与库不一致
      toast.error(e instanceof Error ? e.message : "保存忌口失败");
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    try {
      const next = note.trim() || null;
      await persist(tags, next);
      setSavedNote(note.trim());
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center gap-1.5">
        <Utensils className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">忌口偏好</span>
        {tags.length > 0 ? (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            已选 {tags.length} 项
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        填写后，圈子抽签会优先避开你吃不了的餐厅
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {DIETARY_TAGS.map((tag) => {
          const active = tags.includes(tag.key);
          return (
            <button
              key={tag.key}
              type="button"
              aria-pressed={active}
              onClick={() => void toggleTag(tag.key)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-primary/30 bg-primary/10 font-medium text-primary"
                  : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              {active ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : null}
              {tag.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-border/60 pt-2.5">
        <label
          htmlFor="dietary-note"
          className="text-[11px] text-muted-foreground"
        >
          补充说明（选填）
        </label>
        <textarea
          id="dietary-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
          placeholder="例如：花生严重过敏，会休克"
          rows={2}
          className="mt-1 w-full resize-none rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {note.length}/{MAX_NOTE_LENGTH}
          </span>
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!noteDirty || savingNote}
            onClick={() => void saveNote()}
          >
            {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            保存说明
          </Button>
        </div>
      </div>
    </div>
  );
}
