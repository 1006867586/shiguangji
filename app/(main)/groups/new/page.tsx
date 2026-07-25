import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateGroupForm } from "@/components/group/CreateGroupForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "创建团体" };

export default function NewGroupPage() {
  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link href="/groups" aria-label="返回">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-base font-semibold">创建团体</h1>
      </header>
      <CreateGroupForm />
    </div>
  );
}
