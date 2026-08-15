import { NextResponse } from "next/server";
import dns from "node:dns";
import net from "node:net";

/**
 * GET /api/auth/net-test
 *
 * 调试端点：检查容器内访问 Supabase API 的网络连通性。
 * 排查问题：/api/auth/signin 返回 "fetch failed"（Node.js 访问外网不通）。
 *
 * 测试项：
 *  1. DNS 解析
 *  2. 原生 TCP 连接测试（区分 TCP 不通 vs TLS 失败）
 *  3. 多目标 fetch 对比（国内 vs 海外，确认是否所有海外都不通）
 *  4. HTTPS GET Supabase 根路径 + auth settings
 *  5. 代理环境变量
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "MISSING";
  const supabaseHost =
    supabaseUrl.startsWith("http") ? new URL(supabaseUrl).hostname : null;
  const results: Record<string, unknown> = {
    supabaseUrl,
    nodeEnv: process.env.NODE_ENV,
    nodeVersion: process.version,
  };

  // ------------------------------------------------------------------
  // 1) DNS 解析
  // ------------------------------------------------------------------
  try {
    if (supabaseHost) {
      results.dns = await new Promise((resolve) => {
        dns.lookup(supabaseHost, { all: true, family: 0 }, (err, addresses) => {
          if (err) {
            resolve({ ok: false, error: `${err.code}: ${err.message}` });
          } else {
            resolve({ ok: true, addresses });
          }
        });
      });
    }
  } catch (err: unknown) {
    results.dns = { ok: false, error: String(err) };
  }

  // ------------------------------------------------------------------
  // 2) 原生 TCP 连接测试（net.connect）
  //    区分：TCP 超时（出网被墙/受限） vs TCP 通但 HTTPS 失败（TLS 问题）
  // ------------------------------------------------------------------
  if (supabaseHost) {
    const dnsRes = results.dns as { addresses?: { address: string }[] };
    const firstIp = dnsRes.addresses?.[0]?.address;
    results.tcpConnect = await tcpTest(firstIp ?? supabaseHost, 443, 12_000);
  }

  // ------------------------------------------------------------------
  // 3) 多目标 fetch 对比（8s 超时，只看连通性）
  // ------------------------------------------------------------------
  const targets = [
    { name: "baidu_cn", url: "https://www.baidu.com" },
    { name: "qq_graph_cn", url: "https://graph.qq.com/oauth2.0/token" },
    { name: "cloudflare_intl", url: "https://www.cloudflare.com/cdn-cgi/trace" },
  ];
  if (supabaseUrl.startsWith("http")) {
    targets.push({ name: "supabase_root", url: supabaseUrl });
  }
  results.multiFetch = {};
  await Promise.all(
    targets.map(async ({ name, url }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const start = Date.now();
      try {
        const resp = await fetch(url, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
        });
        (results.multiFetch as Record<string, unknown>)[name] = {
          ok: true,
          status: resp.status,
          elapsedMs: Date.now() - start,
        };
      } catch (err: unknown) {
        const maybeCause = (err as { cause?: unknown })?.cause;
        (results.multiFetch as Record<string, unknown>)[name] = {
          ok: false,
          elapsedMs: Date.now() - start,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          cause: maybeCause ? String(maybeCause) : undefined,
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  // ------------------------------------------------------------------
  // 4) Supabase auth settings（匿名 health 检查，20s 宽松超时）
  // ------------------------------------------------------------------
  try {
    if (supabaseUrl.startsWith("http")) {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const resp = await fetch(`${supabaseUrl}/auth/v1/settings`, {
          method: "GET",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          },
          signal: controller.signal,
        });
        results.fetchAuthSettings = {
          ok: resp.ok,
          status: resp.status,
          elapsedMs: Date.now() - start,
          bodyPreview: !resp.ok ? (await resp.text()).slice(0, 200) : undefined,
        };
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (err: unknown) {
    const maybeCause = (err as { cause?: unknown })?.cause;
    results.fetchAuthSettings = {
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      cause: maybeCause ? String(maybeCause) : undefined,
    };
  }

  // ------------------------------------------------------------------
  // 5) 代理环境变量（检查是否配置了 http 代理导致异常）
  // ------------------------------------------------------------------
  results.proxyEnv = {
    HTTP_PROXY: process.env.HTTP_PROXY ?? process.env.http_proxy ?? "",
    HTTPS_PROXY: process.env.HTTPS_PROXY ?? process.env.https_proxy ?? "",
    NO_PROXY: process.env.NO_PROXY ?? process.env.no_proxy ?? "",
    ALL_PROXY: process.env.ALL_PROXY ?? process.env.all_proxy ?? "",
  };

  return NextResponse.json(results, { status: 200 });
}

// ============================================================
// helpers
// ============================================================

/** 原生 TCP 连接测试：成功/拒绝/超时 三态区分 */
function tcpTest(
  host: string,
  port: number,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.connect({ host, port });
    const finish = (result: Record<string, unknown>) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ ...result, elapsedMs: Date.now() - start, host, port });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () =>
      finish({ tcp: "CONNECTED", ok: true })
    );
    socket.once("timeout", () =>
      finish({ tcp: "TIMEOUT", ok: false, hint: "TCP 连接超时：出网被墙或安全组限制" })
    );
    socket.once("error", (e: Error) =>
      finish({ tcp: "ERROR", ok: false, error: `${e.name}: ${e.message}` })
    );
  });
}
