import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BindQqConfirmSubmit } from "@/components/profile/BindQqConfirmSubmit";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { Profile } from "@/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "确认转移 QQ 绑定" };

type SearchParams = Promise<{ openid?: string; from?: string }>;

/** /profile/bind-qq-confirm — 确认把 QQ 绑定从旧账号转移到当前账号 */
export default async function BindQqConfirmPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const openid = sp.openid ?? "";
  const fromUserId = sp.from ?? "";

  // 必须已登录（cookie 会话），否则引导登录
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/profile/bind-qq-confirm?openid=${openid}&from=${fromUserId}`)}`);
  }

  // 票据校验：openid/from 必须与 callback 写入的 qq_transfer 一致（防 CSRF/篡改）
  const cookieStore = await cookies();
  const ticket = cookieStore.get("qq_transfer")?.value;
  const valid = ticket === `${openid}.${fromUserId}`;

  const supabase = await createServerClient();
  const { data: meProfile } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const { data: fromProfile } = valid
    ? await supabase
        .from("profiles")
        .select("id, nickname, avatar_url")
        .eq("id", fromUserId)
        .maybeSingle()
    : { data: null };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/profile" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            确认转移 QQ 绑定
          </h1>
        </div>
      </header>

      <div className="p-4">
        {!valid ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm font-medium">确认已失效</p>
            <p className="mt-1 text-xs text-muted-foreground">
              请回到个人中心重新发起「绑定 QQ」
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/profile">返回个人中心</Link>
            </Button>
          </div>
        ) : (
          <BindQqConfirmSubmit
            openid={openid}
            fromUserId={fromUserId}
            me={meProfile as Pick<Profile, "id" | "nickname" | "avatar_url"> | null}
            from={fromProfile as Pick<Profile, "id" | "nickname" | "avatar_url"> | null}
          />
        )}
      </div>
    </div>
  );
}
