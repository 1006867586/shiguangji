import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MapPage } from "@/components/map/MapPage";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "美食打卡地图" };

export default async function FoodMapPage({
  searchParams,
}: {
  searchParams?: Promise<{ focus?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?redirect=%2Fmap");
  }
  // 分享链接 ?focus=<placeId>：定位到被分享的打卡点
  const sp = await searchParams;
  const focusId = sp?.focus && sp.focus.trim() ? sp.focus.trim() : null;
  return <MapPage initialFocusId={focusId} />;
}
