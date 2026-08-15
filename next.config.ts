import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 仅用于自托管/容器部署（CloudBase 云托管、Docker）；
  // Vercel 平台自带构建产物处理，VERCEL 环境变量存在时跳过该选项
  output: process.env.VERCEL ? undefined : "standalone",
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
