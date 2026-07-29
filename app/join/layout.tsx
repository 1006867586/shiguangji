import { MainNav } from "@/components/layout/MainNav";

export const metadata = { title: "加入圈子" };

export default function JoinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <MainNav />
    </>
  );
}
