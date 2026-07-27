import { detectPlatform, extractUrlFromText } from "./utils";
import type { ExternalLink } from "@/types";

/** 美团/点评分享文本中提取的元数据 */
interface ShareTextMeta {
  url: string | null;
  title: string | null;
  address: string | null;
  phone: string | null;
  platform: ExternalLink["platform"] | null;
}

/**
 * 从美团/点评分享文本中提取 URL、店名、地址、电话等元数据。
 *
 * 示例输入：
 * 【雾都小馆】快来试试这家餐厅吧！ 【地址：江岸区云林街14号1楼2号】【电话：15347053039】@美团 `http://dpurl.cn/BNE9Tdaz`
 */
export function parseShareText(text: string): ShareTextMeta {
  const result: ShareTextMeta = {
    url: null,
    title: null,
    address: null,
    phone: null,
    platform: null,
  };

  if (!text) return result;

  // 1. 提取 URL（可能被反引号包裹）
  result.url = extractUrlFromText(text);

  // 2. 提取店名（第一个【】且不是地址/电话/位置/人均开头）
  const titleMatch = text.match(/【(?!地址|电话|位置|人均)([^】]+)】/);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // 3. 提取地址
  const addrMatch = text.match(/【(?:地址|位置)[：:]\s*([^】]+)】/);
  if (addrMatch) {
    result.address = addrMatch[1].trim();
  }

  // 4. 提取电话
  const phoneMatch = text.match(/【电话[：:]\s*([^】]+)】/);
  if (phoneMatch) {
    result.phone = phoneMatch[1].trim();
  }

  // 5. 识别平台：业务统一使用大众点评，美团分享文本也归一为 dianping
  if (/@美团/.test(text) || /@(大众)?点评/.test(text)) {
    result.platform = "dianping";
  }

  return result;
}

/** 从 HTML 中抓取的页面元数据 */
interface PageMeta {
  title: string | null;
  coverImage: string | null;
  description: string | null;
  rating: number | null;
  price: string | null;
  address: string | null;
}

/** 仅允许抓取美团/大众点评相关域名（及其子域名），防止 SSRF 扫描内网 */
const ALLOWED_PREVIEW_HOSTS = [
  "dianping.com",
  "meituan.com",
  "dpurl.cn",
  "m.dianping.com",
  "m.meituan.com",
];

/**
 * 检测 hostname 是否为私有/保留 IP 段，防止 SSRF 访问内网。
 * 覆盖 IPv4 私有段、loopback、link-local、保留段，以及 IPv6 loopback / 本地段。
 */
function isPrivateIp(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // IPv6 loopback 与本地站点地址
  if (host === "::1") return true;
  // IPv6 私有 fc00::/7
  if (/^f[cd][0-9a-f]{0,2}(?::[0-9a-f]{0,4}){0,7}$/i.test(host)) return true;
  // IPv6 链路本地 fe80::/10
  if (/^fe[89ab][0-9a-f]?(?::[0-9a-f]{0,4}){0,7}$/i.test(host)) return true;

  // IPv4
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a === 0 || a === 10) return true;
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 私有
    if (a === 192 && b === 168) return true; // 私有
    if (a >= 224) return true; // 组播/保留
  }
  return false;
}

/**
 * 校验待抓取的 URL：仅允许 http(s) + 美团/大众点评域名，拒绝私有 IP 与 localhost。
 * 校验不通过时抛出友好错误，避免 SSRF。
 */
function assertSafeFetchUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("暂不支持该链接,仅支持美团/大众点评");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("暂不支持该链接,仅支持美团/大众点评");
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("暂不支持该链接,仅支持美团/大众点评");
  }
  if (isPrivateIp(host)) {
    throw new Error("暂不支持该链接,仅支持美团/大众点评");
  }
  const allowed = ALLOWED_PREVIEW_HOSTS.some(
    (h) => host === h || host.endsWith("." + h)
  );
  if (!allowed) {
    throw new Error("暂不支持该链接,仅支持美团/大众点评");
  }
}

/**
 * fetch 商家页 HTML（跟随 302 跳转），解析 og meta、title、可见文本中的评分/人均。
 *
 * M 站 shopshare 是 SSR 明文输出，无字体加密，可拿到：
 * - 店名（og:title / <title>）
 * - 封面图（og:image）
 * - 评分（可见文本 "4.4"）
 * - 人均（可见文本 "¥67/人"）
 * - 品类/榜单（可见文本）
 * 电话与详细地址在 share 页被打码（产品策略），需从分享文本补充。
 */
async function fetchPageMeta(url: string): Promise<PageMeta | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9",
      },
      // Vercel Edge/Node fetch 默认无 timeout，手动用 AbortController 限制
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    return parseHtmlMeta(html);
  } catch {
    return null;
  }
}

/** 从 HTML 文本解析 og meta、title、评分、人均 */
function parseHtmlMeta(html: string): PageMeta {
  const meta: PageMeta = {
    title: null,
    coverImage: null,
    description: null,
    rating: null,
    price: null,
    address: null,
  };

  // og:title / <title>
  const ogTitle = matchFirst(html, /<meta\s+property="og:title"\s+content="([^"]+)"/i)
    ?? matchFirst(html, /<meta\s+content="([^"]+)"\s+property="og:title"/i);
  meta.title = ogTitle ?? matchFirst(html, /<title>([^<]+)<\/title>/i)?.trim() ?? null;

  // og:image
  meta.coverImage =
    matchFirst(html, /<meta\s+property="og:image"\s+content="([^"]+)"/i) ??
    matchFirst(html, /<meta\s+content="([^"]+)"\s+property="og:image"/i) ??
    null;

  // og:description / meta description
  meta.description =
    matchFirst(html, /<meta\s+property="og:description"\s+content="([^"]+)"/i) ??
    matchFirst(html, /<meta\s+name="description"\s+content="([^"]+)"/i) ??
    null;

  // 评分：可见文本中的数字（如 "4.4"），常见于评分组件
  // 匹配 "4.4分" 或紧邻"评分"/"评分:"的数字
  const ratingMatch = html.match(/(?:评分|rating)[：:\s]*([0-4]\.\d)|([0-4]\.\d)\s*分/);
  if (ratingMatch) {
    const r = ratingMatch[1] ?? ratingMatch[2];
    meta.rating = r ? parseFloat(r) : null;
  } else {
    // 兜底：匹配独立的 X.X 数字（评分通常 ≤5）
    const fallback = html.match(/>([0-4]\.\d)</);
    if (fallback) meta.rating = parseFloat(fallback[1]);
  }

  // 人均：¥XX/人 或 XX元/人
  const priceMatch = html.match(/[¥￥](\d+)\s*\/\s*人|(人均)[：:\s]*[¥￥]?(\d+)/);
  if (priceMatch) {
    meta.price = priceMatch[1]
      ? `¥${priceMatch[1]}/人`
      : priceMatch[3]
        ? `¥${priceMatch[3]}/人`
        : null;
  }

  // 地址：og:description 或 meta description 里的"地址：xxx"
  if (meta.description) {
    meta.address = extractAddress(meta.description);
  }

  return meta;
}

/** 工具：正则取第一个捕获组 */
function matchFirst(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? decodeHtmlEntities(m[1]) : null;
}

/** 简单 HTML 实体解码 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** 从描述里粗略抽取地址（"地址：xxx"） */
function extractAddress(desc?: string): string | null {
  if (!desc) return null;
  const m = desc.match(/(?:地址|位置)[：:]\s*([^\n,，；;]+)/);
  return m ? m[1].trim() : null;
}

/**
 * 解析外部链接（美团/大众点评等）。
 *
 * 支持两种输入：
 * 1. 纯 URL（https://www.dianping.com/shop/... 或 http://dpurl.cn/xxx）
 * 2. 美团/点评分享文本（含店名、地址、电话、短链接）
 *
 * 解析策略：
 * - 先从分享文本提取元数据（店名/地址/电话，这些在网页 share 页可能被打码）
 * - 再 fetch 商家页 SSR HTML 补充封面图、评分、人均
 * - 文本提取的元数据优先，网页抓取结果仅补充缺失字段
 */
export async function parseExternalLink(
  input: string
): Promise<ExternalLink | null> {
  // 1. 从分享文本提取元数据
  const meta = parseShareText(input);
  const url = meta.url ?? (isValidUrl(input) ? input : null);

  // 没有有效 URL 且没有文本元数据 → 解析失败
  if (!url && !meta.title && !meta.address) {
    return null;
  }

  const platform = meta.platform ?? (url ? detectPlatform(url) : "other");

  // 2. fetch 商家页 HTML 补充封面图、评分、人均
  let pageMeta: PageMeta | null = null;
  if (url) {
    // SSRF 防护：仅允许美团/大众点评域名，拒绝私有 IP / localhost
    assertSafeFetchUrl(url);
    pageMeta = await fetchPageMeta(url);
  }

  // 3. 合并：文本提取优先，网页抓取补充
  return {
    platform,
    url: url ?? "",
    title: meta.title ?? pageMeta?.title ?? url ?? "",
    coverImage: pageMeta?.coverImage ?? null,
    address: meta.address ?? pageMeta?.address ?? null,
    phone: meta.phone ?? null,
    rating: pageMeta?.rating ?? null,
    price: pageMeta?.price ?? null,
  };
}

/** 校验是否为合法 URL */
function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
