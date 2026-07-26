"use client";

import useSWR from "swr";
import { fetchData } from "@/lib/fetcher";

/**
 * 检测 AI 功能是否已配置（后端 minimax key 是否就绪）。
 * 前端据此决定是否渲染「AI 截图识别」「AI 文案生成」等入口。
 * 接口无需登录，仅返回布尔值；缓存 60s 避免重复请求。
 */
export function useAiEnabled() {
  const { data } = useSWR("/api/ai/status", fetchData<{ enabled: boolean }>, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  return data?.enabled ?? false;
}
