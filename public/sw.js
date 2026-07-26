// ============================================================
// 飨刻 Service Worker
// 提供离线缓存能力，策略：
//   - 静态资源 (_next/static): cache-first
//   - 图片 (R2 域名): stale-while-revalidate
//   - API 请求: network-first，失败回退缓存
//   - 导航请求: network-first，失败回退离线页
// ============================================================

const CACHE_VERSION = "xiangke-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-image`;
const API_CACHE = `${CACHE_VERSION}-api`;
const PAGE_CACHE = `${CACHE_VERSION}-page`;

// 预缓存的核心路由
const PRECACHE_URLS = ["/", "/offline.html"];
const OFFLINE_URL = "/offline.html";

// R2 / 图片域名匹配（与 next.config.ts 中 remotePatterns 对齐）
const IMAGE_HOSTS = ["img.xiangke.app", "img.xiangke.dev"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      // 预缓存核心页面，失败不阻断安装
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 清理旧版本缓存
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 仅处理 GET 请求
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 同源且非 http(s) 的请求跳过
  if (url.origin !== self.location.origin && !IMAGE_HOSTS.includes(url.hostname)) {
    return;
  }

  // 1. 静态资源：cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/sw.js"
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 2. 图片（R2 域名）：stale-while-revalidate
  if (IMAGE_HOSTS.includes(url.hostname) || isImageRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  // 3. API 请求：network-first，失败回退缓存
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // 4. 导航请求：network-first，失败回退离线页
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
});

// ---------- 缓存策略实现 ----------

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: "网络不可用" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // 回退到离线页
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return caches.match(OFFLINE_URL) || Response.error();
  }
}

function isImageRequest(request) {
  const dest = request.destination;
  return dest === "image";
}
