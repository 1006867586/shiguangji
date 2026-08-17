import type { MetadataRoute } from "next";

/**
 * PWA Manifest（Next.js metadata route）
 *
 * Next.js 在 build 时生成 /manifest.json 并以
 *   Content-Type: application/manifest+json; charset=utf-8
 * serve（UTF-8 编码），规避 public/manifest.json 在某些部署平台（如 EdgeOne）
 * 下被当成普通 JSON/静态文件导致 content-type 缺失或编码错乱的问题。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "飨刻 - 圈子聚餐记录",
    short_name: "飨刻",
    description: "面向小团体的聚餐记录应用",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f97316",
    lang: "zh-CN",
    orientation: "portrait",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}