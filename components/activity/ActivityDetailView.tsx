"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedCard } from "@/components/feed/FeedCard";
import { PhotoUploader } from "@/components/activity/PhotoUploader";
import { EmptyState } from "@/components/common/EmptyState";
import { useActivity } from "@/hooks/useActivity";
import type { Activity } from "@/types";

interface ActivityDetailViewProps {
  activityId: string;
  currentUserId?: string;
  initialActivity?: Activity | null;
}

export function ActivityDetailView({
  activityId,
  currentUserId,
  initialActivity,
}: ActivityDetailViewProps) {
  const { activity, setActivity, loading, error, reload } = useActivity(
    initialActivity ? null : activityId
  );

  const current = activity ?? initialActivity ?? null;
  const [showUploader, setShowUploader] = useState(false);
  const router = useRouter();

  if (loading && !current) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
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

  return (
    <div className="pb-20">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link href={`/g/${current.group_id}`} aria-label="返回">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-base font-semibold">详情</h1>
      </header>

      <FeedCard
        activity={current}
        currentUserId={currentUserId}
        groupId={current.group_id}
        defaultExpandComments
        linkToDetail={false}
        onDeleted={() => router.push(`/g/${current.group_id}`)}
        onUpdated={(updated) => {
          setActivity(updated);
        }}
      />

      <div className="moment-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">
            照片墙 {current.photo_count > 0 ? `(${current.photo_count})` : ""}
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
        ) : (
          <p className="py-3 text-center text-xs text-muted-foreground">
            还没有照片，点击「补充照片」上传
          </p>
        )}
      </div>
    </div>
  );
}
