import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 模式生成自包含运行产物，适配 CloudBase 云托管 / Vercel / 自托管 Node
  output: "standalone",
  poweredByHeader: false,
  images: {
    // CloudBase 云托管镜像无 Sharp，禁用 Next.js 内置图片优化，避免运行时报错
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
