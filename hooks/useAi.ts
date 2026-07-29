"use client";

import { useCallback, useState } from "react";
import { fetchData } from "@/lib/fetcher";
import type { ParsedReceipt, ParsedScreenshot } from "@/types";

type ScreenshotPlatform =
  | "xiaohongshu"
  | "douyin"
  | "dianping"
  | "unknown";

type CopyStyle = "casual" | "formal" | "humorous" | "enthusiastic";

// ============================================================
// useAiParseScreenshot — 识别小红书/抖音/点评分享截图
// ============================================================

interface UseAiParseScreenshotReturn {
  /** 调用截图识别接口 */
  parse: (
    imageUrl: string,
    platform?: ScreenshotPlatform
  ) => Promise<ParsedScreenshot>;
  loading: boolean;
  error: string | null;
  result: ParsedScreenshot | null;
}

export function useAiParseScreenshot(): UseAiParseScreenshotReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedScreenshot | null>(null);

  const parse = useCallback(
    async (
      imageUrl: string,
      platform?: ScreenshotPlatform
    ): Promise<ParsedScreenshot> => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchData<ParsedScreenshot>(
          "/api/ai/parse-screenshot",
          {
            method: "POST",
            body: JSON.stringify({ imageUrl, platform }),
          }
        );
        setResult(data);
        return data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "截图识别失败";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { parse, loading, error, result };
}

// ============================================================
// useAiCopywrite — 根据店名生成活动文案
// ============================================================

interface UseAiCopywriteReturn {
  /** 生成 3 版文案候选 */
  generate: (input: {
    title: string;
    style?: CopyStyle;
    groupName?: string;
  }) => Promise<string[]>;
  loading: boolean;
  error: string | null;
  copies: string[];
}

export function useAiCopywrite(): UseAiCopywriteReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copies, setCopies] = useState<string[]>([]);

  const generate = useCallback(
    async (input: {
      title: string;
      style?: CopyStyle;
      groupName?: string;
    }): Promise<string[]> => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchData<{ copies: string[] }>(
          "/api/ai/copywrite",
          {
            method: "POST",
            body: JSON.stringify(input),
          }
        );
        setCopies(data.copies);
        return data.copies;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "文案生成失败";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { generate, loading, error, copies };
}

// ============================================================
// useAiInviteText — 为分享到其他圈子生成邀请文案
// ============================================================

interface UseAiInviteTextReturn {
  /** 生成 2-3 版邀请文案 */
  generate: (input: {
    activityId: string;
    targetGroupName: string;
  }) => Promise<string[]>;
  loading: boolean;
  error: string | null;
  copies: string[];
}

export function useAiInviteText(): UseAiInviteTextReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copies, setCopies] = useState<string[]>([]);

  const generate = useCallback(
    async (input: {
      activityId: string;
      targetGroupName: string;
    }): Promise<string[]> => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchData<{ copies: string[] }>(
          "/api/ai/invite-text",
          {
            method: "POST",
            body: JSON.stringify(input),
          }
        );
        setCopies(data.copies);
        return data.copies;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "邀请文案生成失败";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { generate, loading, error, copies };
}

// ============================================================
// useAiReceipt — 识别账单小票照片
// ============================================================

interface UseAiReceiptReturn {
  /** 调用账单识别接口 */
  parse: (imageUrl: string) => Promise<ParsedReceipt>;
  loading: boolean;
  error: string | null;
  result: ParsedReceipt | null;
}

export function useAiReceipt(): UseAiReceiptReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedReceipt | null>(null);

  const parse = useCallback(
    async (imageUrl: string): Promise<ParsedReceipt> => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchData<ParsedReceipt>("/api/ai/receipt", {
          method: "POST",
          body: JSON.stringify({ imageUrl }),
        });
        setResult(data);
        return data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "账单识别失败";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { parse, loading, error, result };
}
