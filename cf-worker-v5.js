/**
 * Cloudflare Worker v5 — m.zykh.top → CloudBase 反向代理
 *
 * 相对 v4 的关键改进：
 *  1. 向源站透传 X-Forwarded-Host / X-Forwarded-Proto 头
 *     → Next.js 中 getPublicOrigin() 最高优先级分支直接命中，不再拿到 0.0.0.0
 *  2. 对响应 Location / Set-Cookie Domain 兜底改写：
 *     即使 Next.js 回了 http://0.0.0.0/*  或 http://CloudBase默认域名/*，
 *     也统一替换成 https://m.zykh.top/*，防止用户跳错域名
 *  3. 保留 v4 已有的 normalizeOrigin（解决 ORIGIN_HOSTNAME 重复粘贴）
 *     和 resolveOverride（强制 DNS 解析 + Host 头为 CloudBase 白名单域名）
 *
 * 部署步骤（Cloudflare Dashboard）：
 *  1. 进入 Workers & Pages → 选中已有的 m-zykh-top Worker
 *  2. 点击 "Edit code"，用本文件内容全部覆盖
 *  3. Settings → Variables：
 *     - 确保 ORIGIN_HOSTNAME = shiguangji-297023-11-1251916854.sh.run.tcloudbase.com
 *       （如果之前粘贴重复了，删掉多余的，只保留 1 段）
 *     - CUSTOM_DOMAIN = m.zykh.top
 *  4. 点 "Save and deploy"
 *  5. 验证：curl -sI https://m.zykh.top/api/auth/qq?redirect=/
 *     Location 里的 redirect_uri 必须是 https://m.zykh.top/api/auth/qq/callback
 *     而不是 http://0.0.0.0/... 或 CloudBase 默认域名
 */

export default {
  async fetch(request, env) {
    // ===== 配置 =====
    const CUSTOM_DOMAIN = (env.CUSTOM_DOMAIN || "m.zykh.top").trim();
    const RAW_ORIGIN_HOSTNAME = (
      env.ORIGIN_HOSTNAME ||
      "shiguangji-297023-11-1251916854.sh.run.tcloudbase.com"
    ).trim();
    const VERSION = "v5-20260815-fwdhost+locfix";

    // ===== 规范化 ORIGIN_HOSTNAME（防重复粘贴兜底）=====
    const ORIGIN_HOSTNAME = normalizeOrigin(RAW_ORIGIN_HOSTNAME);

    const url = new URL(request.url);
    const isDebug = url.pathname === "/__worker_debug";

    // ===== 构造回源 URL =====
    const originUrl = new URL(url.toString());
    // CloudBase 支持 HTTP 80 端口回源，避免 TLS 证书校验 526 错误
    originUrl.protocol = "http:";
    originUrl.port = "80";
    originUrl.hostname = ORIGIN_HOSTNAME;

    // ===== 构造回源请求头（关键改动：透传真实 Host）=====
    const newHeaders = new Headers(request.headers);
    // Host 头 = CloudBase 默认域名（白名单校验需要）
    newHeaders.set("Host", ORIGIN_HOSTNAME);
    // X-Forwarded-Host / X-Forwarded-Proto = 用户实际访问的自定义域名
    // → Next.js getPublicOrigin() 读到这两个头就会返回正确的 origin
    newHeaders.set("X-Forwarded-Host", CUSTOM_DOMAIN);
    newHeaders.set("X-Forwarded-Proto", "https");
    // 多级反代时 X-Forwarded-For 追加
    const clientIP =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "";
    if (clientIP) newHeaders.set("X-Forwarded-For", clientIP);

    // ===== 回源（resolveOverride 强制 DNS 解析到 ORIGIN_HOSTNAME）=====
    const originRequest = new Request(originUrl.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual", // 不要自动跟 3xx，我们要改写 Location
      cf: {
        resolveOverride: ORIGIN_HOSTNAME,
        // HTTP 回源，不做 TLS
        disableError500Details: false,
      },
    });

    let response;
    try {
      response = await fetch(originRequest);
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "origin_fetch_failed",
          message: String(err?.message || err),
          origin: ORIGIN_HOSTNAME,
          version: VERSION,
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "X-Worker-Ver": VERSION,
          },
        }
      );
    }

    // ===== 改写响应头 =====
    const respHeaders = new Headers(response.headers);

    // --- Location 头兜底改写（双保险第 2 层）---
    const location = respHeaders.get("Location");
    if (location) {
      const fixedLocation = fixLocation(location, CUSTOM_DOMAIN, ORIGIN_HOSTNAME);
      if (fixedLocation !== location) {
        respHeaders.set("Location", fixedLocation);
        respHeaders.set("X-Worker-Location-Rewritten", "1");
      }
    }

    // --- Set-Cookie Domain / Path 兜底 ---
    // （一般 Next.js 不写 Domain，但以防 CloudBase 网关注入了错域名）
    const setCookie = respHeaders.getSetCookie ? respHeaders.getSetCookie() : [];
    if (setCookie.length > 0) {
      respHeaders.delete("Set-Cookie");
      for (const cookie of setCookie) {
        let fixed = cookie;
        // Domain=0.0.0.0 或 Domain=CloudBase默认域名 → 删除 Domain 属性让它落到当前 host
        fixed = fixed.replace(
          /Domain=(0\.0\.0\.0|127\.0\.0\.1|localhost|[^;]*tcloudbase\.com[^;]*);?/gi,
          ""
        );
        respHeaders.append("Set-Cookie", fixed);
      }
    }

    // --- 调试自定义头（方便排查）---
    respHeaders.set("X-Worker-Ver", VERSION);
    respHeaders.set("X-Worker-Custom-Host", CUSTOM_DOMAIN);
    respHeaders.set("X-Worker-Origin-Raw", RAW_ORIGIN_HOSTNAME);
    respHeaders.set("X-Worker-Origin-Norm", ORIGIN_HOSTNAME);
    respHeaders.set("X-Worker-CB-Status", String(response.status));

    // ===== __worker_debug 端点 =====
    if (isDebug) {
      const debugResp = {
        version: VERSION,
        customDomain: CUSTOM_DOMAIN,
        originHostnameRaw: RAW_ORIGIN_HOSTNAME,
        originHostnameNormalized: ORIGIN_HOSTNAME,
        originStatus: response.status,
        requestHost: url.hostname,
        xForwardedHostSent: newHeaders.get("X-Forwarded-Host"),
        xForwardedProtoSent: newHeaders.get("X-Forwarded-Proto"),
        originalLocation: location || null,
        fixedLocation: location ? fixLocation(location, CUSTOM_DOMAIN, ORIGIN_HOSTNAME) : null,
      };
      return new Response(JSON.stringify(debugResp, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...Object.fromEntries(respHeaders),
        },
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  },
};

/**
 * 规范化 ORIGIN_HOSTNAME：
 *  - 如果用户在 CloudBase 控制台重复粘贴了域名（变成 a.tcloudbase.coma.tcloudbase.com），
 *    自动裁成一段。以 .sh.run.tcloudbase.com 或常见后缀切分。
 */
function normalizeOrigin(raw) {
  if (!raw) return raw;
  const s = raw.trim();
  // 寻找重复模式：后半段和前半段是否完全相同，且长度合理
  if (s.length >= 20 && s.length % 2 === 0) {
    const half = s.length / 2;
    if (s.slice(0, half) === s.slice(half)) {
      return s.slice(0, half);
    }
  }
  // 兜底：取第一个出现 tcloudbase.com 的那一段（含前面的子域名）
  const idx = s.indexOf("tcloudbase.com");
  if (idx > 0) {
    // 往回找到最近的分隔符（. 或字符串开头）
    let start = idx;
    while (start > 0 && s[start - 1] !== "." && s[start - 1] !== "/") start--;
    return s.slice(start, idx + "tcloudbase.com".length);
  }
  return s;
}

/**
 * 改写 Location 响应头：
 *  把 http://0.0.0.0/*、http://127.0.0.1/*、http://CloudBase默认域名/*
 *  统一替换为 https://{CUSTOM_DOMAIN}/*
 *
 *  如果 Location 已经是合法的外部跳转（QQ / Supabase / 其他 https 域名），保持原样。
 */
function fixLocation(location, customDomain, originHostname) {
  if (!location) return location;

  try {
    const u = new URL(location, "https://placeholder");

    // --- 协议是 http + 主机名是"内网/容器监听/CloudBase 默认域名" → 改 ---
    const badHosts = [
      "0.0.0.0",
      "127.0.0.1",
      "localhost",
      originHostname.toLowerCase(),
    ];
    const hostLower = u.hostname.toLowerCase();
    const isBadHttp = u.protocol === "http:" && badHosts.includes(hostLower);
    // 也兜底 https 但 host 是 0.0.0.0 这种不可能对的情况
    const isBadHostAnyProto =
      hostLower === "0.0.0.0" || hostLower === "127.0.0.1" || hostLower === "localhost";

    if (isBadHttp || isBadHostAnyProto) {
      u.protocol = "https:";
      u.hostname = customDomain;
      u.port = "";
      return u.toString();
    }

    // 主机名就是 CloudBase 默认域名（不管协议），也换成自定义域名
    if (hostLower === originHostname.toLowerCase()) {
      u.protocol = "https:";
      u.hostname = customDomain;
      u.port = "";
      return u.toString();
    }

    return location;
  } catch {
    // 解析失败（可能是相对路径）就原样返回，相对路径不需要改
    return location;
  }
}
