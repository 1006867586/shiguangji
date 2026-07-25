import { getLinkPreview } from "link-preview-js";
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

  // 5. 识别平台（@美团 / @大众点评 / @点评）
  if (/@美团/.test(text)) {
    result.platform = "meituan";
  } else if (/@(大众)?点评/.test(text)) {
    result.platform = "dianping";
  }

  return result;
}

/**
 * 解析外部链接（美团/大众点评等）。
 *
 * 支持两种输入：
 * 1. 纯 URL（https://www.dianping.com/shop/...）
 * 2. 美团/点评分享文本（含店名、地址、电话、短链接）
 *
 * 解析策略：先从文本提取元数据（店名/地址/电话），再用 URL 抓取 OG 元数据补充封面图，
 * 文本提取的元数据优先，抓取结果仅用于补充缺失字段。
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

  // 2. 尝试抓取 OG 元数据（用于补充封面图）
  let ogTitle: string | undefined;
  let ogImage: string | undefined;
  let ogAddress: string | undefined;

  if (url) {
    try {
      const preview = (await getLinkPreview(url, {
        timeout: 5000,
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        },
      })) as {
        title?: string;
        url?: string;
        images?: string[];
        description?: string;
      };

      ogTitle = preview.title;
      ogImage = preview.images?.[0];
      ogAddress = extractAddress(preview.description) ?? undefined;
    } catch {
      // 抓取失败（短链反爬等），降级用文本提取的元数据
    }
  }

  // 3. 合并：文本提取优先，抓取结果补充
  return {
    platform,
    url: url ?? "",
    title: meta.title ?? ogTitle ?? url ?? "",
    coverImage: ogImage ?? null,
    address: meta.address ?? ogAddress ?? null,
    phone: meta.phone ?? null,
    rating: null,
    price: null,
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

/** 从描述里粗略抽取地址（"地址：xxx"） */
function extractAddress(desc?: string): string | null {
  if (!desc) return null;
  const m = desc.match(/(?:地址|位置)[：:]\s*([^\n,，；;]+)/);
  return m ? m[1].trim() : null;
}
