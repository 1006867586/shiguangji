// ============================================================
// OG 图片 CJK 字体加载
// Satori (next/og) 默认仅含拉丁字体，中文会渲染为豆腐块。
// 这里从 Google Fonts 拉取 Noto Sans SC 的 CJK 子集并模块级缓存。
// 失败时返回 null，ImageResponse 回退到默认字体（中文可能不显示，但不报错）。
// ============================================================

let cached: ArrayBuffer | null | undefined = undefined;

/**
 * 加载 Noto Sans SC（CJK 子集）字体。
 * 使用模块级缓存，仅冷启动时拉取一次。
 *
 * @returns 字体二进制数据；失败返回 null
 */
export async function loadCJKFont(): Promise<ArrayBuffer | null> {
  if (cached !== undefined) return cached;

  try {
    // 1. 请求 Google Fonts CSS（需要浏览器 UA 才返回 woff2 格式）
    const cssRes = await fetch(
      "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400&display=swap",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );
    if (!cssRes.ok) {
      cached = null;
      return null;
    }
    const css = await cssRes.text();

    // 2. 从 CSS 中找到 CJK 子集的 woff2 URL（unicode-range 包含 U+4E00）
    const blocks = css.split("@font-face");
    let woff2Url: string | null = null;

    for (const block of blocks) {
      // CJK 字符范围以 U+4E00 起始
      if (block.includes("U+4E00") || block.includes("U+4e00")) {
        const m = block.match(/src:\s*url\((https:\/\/[^)]+)\)/);
        if (m) {
          woff2Url = m[1];
          break;
        }
      }
    }

    // 回退：取最后一个 woff2 URL（CJK 子集通常排在最后）
    if (!woff2Url) {
      const matches = [...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)];
      if (matches.length > 0) {
        woff2Url = matches[matches.length - 1][1];
      }
    }

    if (!woff2Url) {
      cached = null;
      return null;
    }

    // 3. 下载字体二进制
    const fontRes = await fetch(woff2Url);
    if (!fontRes.ok) {
      cached = null;
      return null;
    }
    cached = await fontRes.arrayBuffer();
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

/** ImageResponse fonts 参数的标准构造 */
export async function getOGFonts(): Promise<
  { name: string; data: ArrayBuffer; weight: 400; style: "normal" }[]
> {
  const data = await loadCJKFont();
  return data ? [{ name: "NotoSansSC", data, weight: 400, style: "normal" }] : [];
}
