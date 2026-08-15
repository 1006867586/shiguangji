import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 仅用于自托管/容器部署（CloudBase 云托管、Docker）；
  // Vercel / EdgeOne Pages 平台自行处理构建产物，保持默认。
  // Dockerfile 里会显式设置 NEXT_OUTPUT=standalone 启用它。
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  images: {
    // 保持未优化：QQ 头像等第三方域名无法穷举 remotePatterns，
    // 且 Vercel 上 unoptimized 同样可用（仅少了边缘压缩）
    unoptimized: true,
    remotePatterns: [
      { hostname: "img.xiangke.app" },
      { hostname: "img.xiangke.dev" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
