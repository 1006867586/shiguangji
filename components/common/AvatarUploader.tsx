"use client";

import { useRef, useState } from "react";
import { Loader2, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "./UserAvatar";
import { useUpload } from "@/hooks/useUpload";
import { cn } from "@/lib/utils";

interface AvatarUploaderProps {
  /** 当前头像 URL（可为 null） */
  value: string | null;
  /** 昵称（用于无头像时显示首字） */
  nickname: string;
  /** 上传完成回调，传入新的 URL（或 null 表示清除） */
  onChange: (url: string | null) => void;
  /** 头像尺寸，默认 72 */
  size?: number;
  className?: string;
}

/**
 * 头像上传组件：点击头像/相机按钮选择图片，压缩后直传 R2，回调返回新 URL。
 * 同时提供「清除」按钮。
 */
export function AvatarUploader({
  value,
  nickname,
  onChange,
  size = 72,
  className,
}: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading, progress } = useUpload();
  const [hover, setHover] = useState(false);

  const handleSelect = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 重置 input value 以便重复选择同一文件
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    try {
      const url = await uploadFile(file, "image");
      if (url) {
        onChange(url);
        toast.success("头像已更新");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    }
  };

  const handleClear = () => {
    onChange(null);
  };

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div
        className="relative group cursor-pointer"
        onClick={handleSelect}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSelect();
          }
        }}
        style={{ width: size, height: size }}
      >
        <UserAvatar
          profile={{ nickname, avatar_url: value }}
          size={size}
        />
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        ) : (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full bg-black/40 transition-opacity",
              hover ? "opacity-100" : "opacity-0"
            )}
          >
            <Camera className="h-6 w-6 text-white" />
          </div>
        )}
        {uploading && progress > 0 && progress < 100 && (
          <div className="absolute -bottom-1 left-0 right-0 text-center text-xs text-white">
            {progress}%
          </div>
        )}
      </div>

      {value && !uploading && (
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
          清除头像
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
