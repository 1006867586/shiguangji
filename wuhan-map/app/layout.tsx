import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "武汉记忆地图",
  description: "在武汉各区挂上你自己的回忆",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
