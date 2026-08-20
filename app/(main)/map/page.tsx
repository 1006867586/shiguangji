import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MapPage } from "@/components/map/MapPage";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "美食打卡地图" };

export default async function FoodMapPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?redirect=%2Fmap");
  }
  return <MapPage />;
}
