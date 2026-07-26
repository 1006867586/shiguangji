"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          background: "#ffffff",
          color: "#0a0a0b",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "24px",
            paddingTop: "calc(env(safe-area-inset-top) + 24px)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 80px)",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#f97316",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 12h17M3.5 12c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5-3.8 8.5-8.5 8.5-8.5-3.8-8.5-8.5Z" />
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>出错了</h2>
          <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
            {error.message || "发生未知错误，请稍后重试"}
          </p>
          {error.digest ? (
            <p style={{ fontSize: 11, color: "#aaa", margin: 0 }}>
              错误码：{error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 6,
              border: "none",
              background: "#f97316",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 2v6h6M21 12A9 9 0 0 0 6 5.3L3 8" />
              <path d="M21 22v-6h-6M3 12a9 9 0 0 0 15 6.7l3-2.7" />
            </svg>
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
