import type { CookieOptions } from "@supabase/ssr";

/** Supabase setAll 回调收到的 cookie 数组元素类型 */
export interface CookieEntry {
  name: string;
  value: string;
  options: CookieOptions;
}

export type CookiesToSet = CookieEntry[];
