import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ActivityDetailView } from "@/components/activity/ActivityDetailView";
import { fetchActivityDetail } from "@/lib/activities";
import { createServerClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("activities")
    .select("content")
    .eq("id", id)
    .maybeSingle();
  return { title: data?.content?.slice(0, 30) ?? "活动详情" };
}

export default async function ActivityDetailPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/activity/${id}`)}`);
  }

  const activity = await fetchActivityDetail({
    activityId: id,
    userId: user.id,
  });

  if (!activity) notFound();

  return (
    <ActivityDetailView
      activityId={id}
      currentUserId={user.id}
      initialActivity={activity}
    />
  );
}
