import { NextRequest, NextResponse } from "next/server";
import { isAllowedImageUrl } from "@/lib/utils";

/**
 * 同域图片代理：为 html2canvas 海报合成提供无 CORS 问题的图片源。
 *
 * 工作原理：
 * - 客户端请求 /api/image-proxy?url=https://img1.zykh.top/xxx.jpg
 * - 服务端 fetch 原图，附带 CORS 头返回给浏览器
 * - 客户端 <img src="/api/image-proxy?url=..."> 同源，canvas 不会被 taint
 *
 * 安全：
 * - 仅允许 isAllowedImageUrl 白名单域名的图片（防 SSRF）
 * - 限制 10MB 响应体（防大文件打满内存）
 * - 5s 超时（防慢响应阻塞）
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  // 安全校验：仅代理白名单域名的图片
  if (!isAllowedImageUrl(url)) {
    return NextResponse.json({ error: "域名不在白名单" }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "xiangke-image-proxy/1.0" },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return NextResponse.json(
        { error: `源站返回 ${resp.status}` },
        { status: 502 }
      );
    }

    const contentType =
      resp.headers.get("content-type") ?? "image/jpeg";
    // 限制 10MB，防止恶意大图打满内存
    const contentLength = parseInt(
      resp.headers.get("content-length") ?? "0",
      10
    );
    if (contentLength > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "图片超过 10MB 限制" },
        { status: 413 }
      );
    }

    const body = await resp.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (err) {
    const msg =
      err instanceof DOMException && err.name === "AbortError"
        ? "源站响应超时"
        : "图片代理失败";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
