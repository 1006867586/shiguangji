import { notFound } from "next/navigation";
import { ActivityDetailView } from "@/components/activity/ActivityDetailView";
import { fetchActivityDetail } from "@/lib/activities";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function ActivityDetailPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const activity = await fetchActivityDetail({
    activityId: id,
    userId: user.id,
  });

  return (
    <ActivityDetailView
      activityId={id}
      currentUserId={user.id}
      initialActivity={activity}
    />
  );
}
