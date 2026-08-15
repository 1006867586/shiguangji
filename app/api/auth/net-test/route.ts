import { NextResponse, type NextRequest } from "next/server";
import dns from "node:dns";
import net from "node:net";

/**
 * GET /api/auth/net-test[?test=xxx]
 *
 * 调试端点：检查容器内访问 Supabase API 的网络连通性。
 * 排查问题：/api/auth/signin 返回 "fetch failed"（Node.js 访问外网不通）。
 *
 * 重要：所有测试并行执行、单项 6s 超时，整体 <7s 必须返回，
 * 否则 Cloudflare Worker/网关会以 503 {"error":"网络不可用"} 掐断连接。
 *
 * ?test=tcp|dns|fetch_baidu_cn|fetch_qq_cn|fetch_cf_intl|fetch_supabase|fetch_auth
 *      → 只跑单项（备用，进一步降低耗时）
 */
const TIMEOUT_MS = 6_000;

export async function GET(request: NextRequest) {
  const only = request.nextUrl.searchParams.get("test");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "MISSING";
  const supabaseHost =
    supabaseUrl.startsWith("http") ? new URL(supabaseUrl).hostname : null;

  const results: Record<string, unknown> = {
    supabaseUrl,
    nodeEnv: process.env.NODE_ENV,
    nodeVersion: process.version,
    mode: only ?? "all",
  };

  /** 所有任务并行，各自写各自的 key */
  const tasks: Record<string, Promise<unknown>> = {};
  const run = (name: string, fn: () => Promise<unknown>) => {
    if (!only || only === name || only === "all") {
      tasks[name] = fn();
    }
  };

  // 1) DNS 解析
  run("dns", () =>
    supabaseHost ? dnsLookup(supabaseHost) : Promise.resolve({ ok: false, error: "no host" })
  );

  // 2) 原生 TCP 443（区分 TCP 不通 vs TLS 失败）
  run("tcp", async () => {
    if (!supabaseHost) return { ok: false, error: "no host" };
    const d = (await dnsLookup(supabaseHost)) as {
      addresses?: { address: string }[];
    };
    const ip = d.addresses?.[0]?.address;
    return tcpTest(ip ?? supabaseHost, 443, TIMEOUT_MS);
  });

  // 3) 多目标 HTTPS fetch 对比（国内 vs 海外）
  const fetchTargets: Record<string, () => Promise<unknown>> = {
    fetch_baidu_cn: () => fetchTest("https://www.baidu.com", TIMEOUT_MS),
    fetch_qq_cn: () => fetchTest("https://graph.qq.com/oauth2.0/token", TIMEOUT_MS),
    fetch_cf_intl: () => fetchTest("https://www.cloudflare.com/cdn-cgi/trace", TIMEOUT_MS),
  };
  if (supabaseUrl.startsWith("http")) {
    fetchTargets.fetch_supabase = () => fetchTest(supabaseUrl, TIMEOUT_MS);
    fetchTargets.fetch_auth = () =>
      fetchTest(`${supabaseUrl}/auth/v1/settings`, TIMEOUT_MS, {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      });
  }
  for (const [name, fn] of Object.entries(fetchTargets)) {
    run(name, fn);
  }

  // 并行等待所有任务（Promise.all 不会因单项 reject 中断，各任务内部已 catch）
  await Promise.all(
    Object.entries(tasks).map(async ([k, p]) => {
      results[k] = await p;
    })
  );

  // 4) 代理环境变量
  if (!only || only === "proxy" || only === "all") {
    results.proxyEnv = {
      HTTP_PROXY: process.env.HTTP_PROXY ?? process.env.http_proxy ?? "",
      HTTPS_PROXY: process.env.HTTPS_PROXY ?? process.env.https_proxy ?? "",
      NO_PROXY: process.env.NO_PROXY ?? process.env.no_proxy ?? "",
      ALL_PROXY: process.env.ALL_PROXY ?? process.env.all_proxy ?? "",
    };
  }

  return NextResponse.json(results, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

// ============================================================
// helpers
// ============================================================

function dnsLookup(
  hostname: string
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true, family: 0 }, (err, addresses) => {
      if (err) {
        resolve({ ok: false, error: `${err.code}: ${err.message}` });
      } else {
        resolve({ ok: true, addresses });
      }
    });
  });
}

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
    socket.once("connect", () => finish({ tcp: "CONNECTED", ok: true }));
    socket.once("timeout", () =>
      finish({ tcp: "TIMEOUT", ok: false, hint: "TCP 连接超时：出网被墙或安全组限制" })
    );
    socket.once("error", (e: Error) =>
      finish({ tcp: "ERROR", ok: false, error: `${e.name}: ${e.message}` })
    );
  });
}

async function fetchTest(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers,
    });
    return {
      ok: true,
      status: resp.status,
      elapsedMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const maybeCause = (err as { cause?: unknown })?.cause;
    return {
      ok: false,
      elapsedMs: Date.now() - start,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      cause: maybeCause ? String(maybeCause) : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
