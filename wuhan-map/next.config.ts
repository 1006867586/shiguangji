import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 把 Turbopack 的 root 锁定到本项目目录，避免误读上层 workspace 的 middleware/lockfile
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
