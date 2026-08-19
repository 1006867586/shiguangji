import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { FootprintsView } from "@/components/map/FootprintsView";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "我的足迹" };

export default async function FootprintsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?redirect=%2Fme%2Ffootprints");
  }
  return <FootprintsView />;
}
