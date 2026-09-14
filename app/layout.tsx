import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaInstaller } from "@/components/PwaInstaller";
import { APP_NAME } from "@/lib/constants";
import { normalizeEnvUrl } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  // 中文 UI 下中文字符走系统字体栈（globals.css 的 fallback），
  // Fraunces 仅作为拉丁字符 / 数字 / 品牌标题装饰字体使用。
  // 之前配置 axes: ["SOFT", "WONK", "opsz"] + weight: "variable" +
  // style: ["normal","italic"] 会让 Next.js 生成多个 woff2 切片
  // preload，浏览器发现未在 load 事件后及时命中，console 报：
  //   "preloaded but not used within a few seconds"
  // 精简：去掉装饰轴 SOFT/WONK（中文 UI 无处引用），保留 opsz
  // （标题光学尺寸，对 display: large 标题有用）；weight 保持
  // variable（一个 woff2 覆盖全字重），style 保留 normal + italic
  // 因为 LoginClient.tsx 用了 italic 装饰。
  display: "swap",
  axes: ["opsz"],
  weight: "variable",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // EdgeOne 等平台可能注入裸域名（无 https:// 前缀），直接 new URL() 会抛
  // ERR_INVALID_URL 导致 build 失败。normalizeEnvUrl 会补齐协议前缀。
  metadataBase: new URL(
    normalizeEnvUrl(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000")
  ),
  title: {
    default: `${APP_NAME} · 今天吃什么转盘与店铺收藏`,
    template: `%s · ${APP_NAME}`,
  },
  description: "今天吃什么转盘随机选餐，店铺收藏管理",
  applicationName: APP_NAME,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: APP_NAME,
  },
  twitter: {
    card: "summary",
  },
};

export const viewport: Viewport = {
  themeColor: [
    // 与 globals.css 的 --background 保持一致：浅暖色米白 + 深可可色，避免地址栏与页面底色色差
    { media: "(prefers-color-scheme: light)", color: "#f7f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#131210" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} ${fraunces.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" />
          <PwaInstaller />
        </ThemeProvider>
      </body>
    </html>
  );
}
