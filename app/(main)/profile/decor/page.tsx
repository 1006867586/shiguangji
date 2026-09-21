import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { DecorPanel } from "@/components/profile/DecorPanel";
import {
  getServerDecor,
  getServerProfile,
} from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "我的装扮" };

export default async function ProfileDecorPage() {
  const [profile, decor] = await Promise.all([
    getServerProfile(),
    getServerDecor(),
  ]);

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/profile" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            我的装扮
          </h1>
        </div>
      </header>

      {profile && decor ? (
        <DecorPanel
          initialData={decor}
          profile={{
            nickname: profile.nickname,
            avatar_url: profile.avatar_url,
          }}
        />
      ) : (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="装扮数据加载失败"
          description="暂时无法读取你的装扮信息，请稍后刷新重试；若持续出现，请确认个人资料数据是否完整。"
        />
      )}
    </div>
  );
}