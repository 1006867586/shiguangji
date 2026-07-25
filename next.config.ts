import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // EdgeOne Pages 支持 SSR/ISR/SSG，无需 static export
  images: {
    remotePatterns: [
      { hostname: "**.r2.cloudflarestorage.com" },
      { hostname: "img.xiangke.app" },
      { hostname: "img.xiangke.dev" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
