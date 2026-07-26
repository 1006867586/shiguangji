"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedCard } from "@/components/feed/FeedCard";
import { FeedCardSkeleton } from "@/components/feed/FeedCardSkeleton";
import { PhotoGrid } from "@/components/activity/PhotoGrid";
import { PhotoUploader } from "@/components/activity/PhotoUploader";
import { PhotoCaptionEditor } from "@/components/activity/PhotoCaptionEditor";
import { EmptyState } from "@/components/common/EmptyState";
import { useActivity } from "@/hooks/useActivity";
import type { Activity } from "@/types";

interface ActivityDetailViewProps {
  activityId: string;
  currentUserId?: string;
  initialActivity?: Activity | null;
  /** 当前用户是否团体管理员（由服务端传入），用于 FeedCard 显示置顶菜单 */
  isAdmin?: boolean;
}

export function ActivityDetailView({
  activityId,
  currentUserId,
  initialActivity,
  isAdmin = false,
}: ActivityDetailViewProps) {
  const { activity, setActivity, loading, error, reload } = useActivity(
    initialActivity ? null : activityId
  );

  const current = activity ?? initialActivity ?? null;
  const [showUploader, setShowUploader] = useState(false);
  const router = useRouter();

  // 照片描述编辑器状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<{
    photoId: string;
    caption: string | null;
  } | null>(null);

  if (loading && !current) {
    return (
      <div className="p-3">
        <div className="overflow-hidden rounded-2xl">
          <FeedCardSkeleton />
        </div>
      </div>
    );
  }

  if (error && !current) {
    return (
      <EmptyState
        title="加载失败"
        description={error}
        action={
          <Button variant="outline" size="sm" onClick={reload}>
            重试
          </Button>
        }
      />
    );
  }

  if (!current) {
    return (
      <EmptyState
        title="活动不存在"
        description="可能已被删除或你没有访问权限"
      />
    );
  }

  // 保存描述后回写到本地 activity.photos
  const handleCaptionSaved = (photoId: string, caption: string | null) => {
    setActivity({
      ...current,
      photos: current.photos.map((p) =>
        p.id === photoId ? { ...p, caption } : p
      ),
    });
  };

  return (
    <div className="pb-20">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href={`/g/${current.group_id}`} aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">详情</h1>
        </div>
      </header>

      <div className="space-y-2.5 p-3">
        <div className="overflow-hidden rounded-2xl">
          <FeedCard
            activity={current}
            currentUserId={currentUserId}
            groupId={current.group_id}
            defaultExpandComments
            linkToDetail={false}
            showAdvanced
            isAdmin={isAdmin}
            onDeleted={() => router.push(`/g/${current.group_id}`)}
            onUpdated={(updated) => {
              setActivity(updated);
            }}
          />
        </div>

        <div className="overflow-hidden rounded-2xl">
          <div className="moment-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 font-display text-base font-semibold tracking-tight">
                照片墙
                {current.photo_count > 0 ? (
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {current.photo_count}
                  </span>
                ) : null}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowUploader((v) => !v)}
              >
                {showUploader ? "收起" : "补充照片"}
              </Button>
            </div>

            {showUploader ? (
              <div className="mb-4">
                <PhotoUploader
                  activityId={current.id}
                  existingPhotos={current.photos}
                  canDelete
                  onUploaded={(p) => {
                    setActivity({
                      ...current,
                      photos: [...current.photos, p],
                      photo_count: current.photo_count + 1,
                    });
                  }}
                />
              </div>
            ) : current.photos.length > 0 ? (
              <PhotoGrid
                photos={current.photos}
                canEdit
                onEditCaption={(photoId, caption) => {
                  setEditingPhoto({ photoId, caption });
                  setEditorOpen(true);
                }}
              />
            ) : (
              <p className="py-3 text-center text-xs text-muted-foreground">
                还没有照片，点击「补充照片」上传
              </p>
            )}
          </div>
        </div>
      </div>

      <PhotoCaptionEditor
        activityId={current.id}
        photoId={editingPhoto?.photoId ?? null}
        initialCaption={editingPhoto?.caption ?? null}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={handleCaptionSaved}
      />
    </div>
  );
}
