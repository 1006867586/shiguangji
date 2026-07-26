"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePhotoCaption } from "@/hooks/usePhotoCaption";

interface PhotoCaptionEditorProps {
  activityId: string;
  /** 当前编辑的 photoId；为 null 时对话框不工作 */
  photoId: string | null;
  /** 进入编辑器时的初始描述（每次 open 切换为 true 时同步） */
  initialCaption: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存成功后回调，参数为 (photoId, 新 caption（可能为 null）) */
  onSaved?: (photoId: string, caption: string | null) => void;
}

/** 描述最大长度（与 UI 计数一致） */
const CAPTION_MAX = 200;

/** 照片描述编辑器：Dialog 形态，输入 + 保存/取消 */
export function PhotoCaptionEditor({
  activityId,
  photoId,
  initialCaption,
  open,
  onOpenChange,
  onSaved,
}: PhotoCaptionEditorProps) {
  const { updateCaption, loading } = usePhotoCaption(activityId);
  const [caption, setCaption] = useState(initialCaption ?? "");

  // 每次打开对话框时同步初始值
  useEffect(() => {
    if (open) {
      setCaption(initialCaption ?? "");
    }
  }, [open, initialCaption]);

  const handleSave = async () => {
    if (!photoId) return;
    const trimmed = caption.trim();
    try {
      const updated = await updateCaption(photoId, trimmed);
      onSaved?.(photoId, updated.caption);
      onOpenChange(false);
      toast.success("描述已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑描述</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="添加描述..."
            rows={3}
            maxLength={CAPTION_MAX}
            disabled={loading}
            autoFocus
          />
          <div className="text-right text-xs text-muted-foreground">
            {caption.length}/{CAPTION_MAX}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={loading || !photoId}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
