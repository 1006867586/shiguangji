/**
 * URL 参数安全解码。
 *
 * Taro 在解析 router.params 时已对 query 做一次 decodeURIComponent（URLSearchParams polyfill），
 * 因此部分页面再手动 decode 会造成双重解码：普通中文无害，但含 `%` 的值（如店名 "100%餐厅"）
 * 会抛 URIError 或乱码。
 *
 * safeDecodeURIComponent 兼容两种来源：
 * - 已解码值（Taro params）→ decodeURIComponent 不抛错时原样返回
 * - 未解码值（原始 query）→ 正常解码一次
 * - 含非法转义（如已解码字符串里的裸 %）→ 返回原值
 */
export function safeDecodeURIComponent(value?: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
