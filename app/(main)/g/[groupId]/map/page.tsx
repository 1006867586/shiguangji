import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CircleMapView } from "@/components/map/CircleMapView";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import type { CircleCheckinPlace } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ groupId: string }> };

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { groupId } = await params;
  if (!isUuid(groupId)) return { title: "圈子打卡地图" };
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();
  return { title: data?.name ? `${data.name} · 打卡地图` : "圈子打卡地图" };
}

export default async function CircleMapPage({ params }: Params) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/g/${groupId}/map`)}`);
  }

  if (!isUuid(groupId)) notFound();

  const supabase = await createServerClient();

  // 校验圈子存在且用户是成员（与 get_group_checkin_places 内部校验一致，提前给 404）
  const { data: membership } = await supabase
    .from("group_members")
    .select("group:groups!inner(name)")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) notFound();
  const groupName =
    (membership.group as { name?: string } | null)?.name ?? "圈子";

  const { data, error } = await supabase.rpc("get_group_checkin_places", {
    p_group_id: groupId,
  });
  if (error) {
    if (String(error.message ?? "").includes("not a member")) notFound();
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const places: CircleCheckinPlace[] = rows.map((r) => ({
    place_id: r.place_id as string,
    name: r.name as string,
    address: (r.address as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    lng: Number(r.lng),
    lat: Number(r.lat),
    checkin_count: Number(r.checkin_count),
    last_checked_at: (r.last_checked_at as string | null) ?? null,
  }));

  return (
    <div className="min-h-dvh pb-6">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href={`/g/${groupId}`} aria-label="返回圈子">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <h1 className="truncate font-display text-lg font-semibold tracking-tight">
              {groupName} · 打卡地图
            </h1>
          </div>
        </div>
      </header>

      <CircleMapView places={places} groupId={groupId} />
    </div>
  );
}
