export const metadata = { title: "登录" };

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#f5f6f7]">
      {children}
    </div>
  );
}
