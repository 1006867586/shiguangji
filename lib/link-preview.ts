import { getLinkPreview } from "link-preview-js";
import { detectPlatform } from "./utils";
import type { ExternalLink } from "@/types";

/**
 * 解析外部链接（美团/大众点评等）的 Open Graph 元数据。
 * 失败时返回 null，由调用方降级为手动编辑。
 */
export async function parseExternalLinkUrl(
  url: string
): Promise<ExternalLink | null> {
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

    const platform = detectPlatform(url);
    return {
      platform,
      url,
      title: preview.title ?? url,
      coverImage: preview.images?.[0] ?? null,
      address: extractAddress(preview.description) ?? null,
      rating: null,
      price: null,
    };
  } catch {
    return null;
  }
}

/** 从描述里粗略抽取地址（"地址：xxx"） */
function extractAddress(desc?: string): string | null {
  if (!desc) return null;
  const m = desc.match(/(?:地址|位置)[：:]\s*([^\n,，；;]+)/);
  return m ? m[1].trim() : null;
}
