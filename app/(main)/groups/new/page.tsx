import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateGroupForm } from "@/components/group/CreateGroupForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "创建团体" };

export default function NewGroupPage() {
  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65 pt-safe-t">
        <div className="flex h-14 items-center gap-1 px-1">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9">
            <Link href="/groups" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">创建团体</h1>
        </div>
      </header>
      <CreateGroupForm />
    </div>
  );
}
