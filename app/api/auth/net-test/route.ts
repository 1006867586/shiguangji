import { NextResponse } from "next/server";
import dns from "node:dns";
import { spawn } from "node:child_process";

/**
 * GET /api/auth/net-test
 *
 * 调试端点：检查容器内访问 Supabase API 的网络连通性。
 * 排查问题：/api/auth/signin 返回 "fetch failed"（Node.js 访问外网不通）。
 *
 * 测试项：
 *  1. DNS 解析 zyitmtbxpnalsuwzwcuc.supabase.co
 *  2. TCP 连接 443 端口（如果 curl 可用）
 *  3. HTTPS GET /（用原生 fetch + 原生 dns 解析，绕过 Node.js cache）
 *  4. Supabase auth health endpoint（匿名可访问）
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "MISSING";
  const results: Record<string, unknown> = {
    supabaseUrl,
    nodeEnv: process.env.NODE_ENV,
  };

  // ------------------------------------------------------------------
  // 1) DNS 解析
  // ------------------------------------------------------------------
  try {
    if (supabaseUrl && supabaseUrl.startsWith("http")) {
      const hostname = new URL(supabaseUrl).hostname;
      results.dns = await new Promise((resolve) => {
        dns.lookup(hostname, { all: true, family: 0 }, (err, addresses) => {
          if (err) {
            resolve({ ok: false, error: `${err.code}: ${err.message}` });
          } else {
            resolve({ ok: true, addresses });
          }
        });
      });
    }
  } catch (err) {
    results.dns = { ok: false, error: String(err) };
  }

  // ------------------------------------------------------------------
  // 2) 尝试 curl -v 测试 HTTPS 握手（如果容器内有 curl）
  // ------------------------------------------------------------------
  try {
    const curlPath = await execWhich("curl");
    if (curlPath && supabaseUrl && supabaseUrl.startsWith("http")) {
      const curlOut = await execCmd(
        curlPath,
        ["-sS", "--max-time", "10", "-o", "/dev/null", "-w", jsonCurlFormat(), supabaseUrl],
        15
      );
      try {
        results.curl = JSON.parse(curlOut.stdout);
      } catch {
        results.curl = { raw: curlOut.stdout, stderr: curlOut.stderr };
      }
      results.curlPath = curlPath;
    } else {
      results.curlPath = "(curl not available)";
    }
  } catch (err) {
    results.curl = { ok: false, error: String(err) };
  }

  // ------------------------------------------------------------------
  // 3) 原生 Node.js fetch GET Supabase 根路径
  // ------------------------------------------------------------------
  try {
    if (supabaseUrl && supabaseUrl.startsWith("http")) {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const resp = await fetch(supabaseUrl, {
          method: "GET",
          signal: controller.signal,
          redirect: "manual",
        });
        results.fetchRoot = {
          ok: true,
          status: resp.status,
          statusText: resp.statusText,
          elapsedMs: Date.now() - start,
          contentType: resp.headers.get("content-type"),
        };
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (err) {
    results.fetchRoot = {
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      cause: (err as any)?.cause ? String((err as any).cause) : undefined,
    };
  }

  // ------------------------------------------------------------------
  // 4) Supabase auth settings（匿名 health 检查）
  // ------------------------------------------------------------------
  try {
    if (supabaseUrl && supabaseUrl.startsWith("http")) {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
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
        };
        if (!resp.ok) {
          results.fetchAuthSettings.bodyPreview = (await resp.text()).slice(0, 200);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (err) {
    results.fetchAuthSettings = {
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      cause: (err as any)?.cause ? String((err as any).cause) : undefined,
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

function jsonCurlFormat(): string {
  // curl -w 输出 JSON 字符串（注意不要换行）
  return (
    '{"http_code":%{http_code},"time_total":%{time_total},' +
    '"time_connect":%{time_connect},"time_appconnect":%{time_appconnect},' +
    '"remote_ip":"%{remote_ip}","remote_port":%{remote_port},' +
    '"size_download":%{size_download},"errormsg":"%{errormsg}",' +
    '"ssl_verify_result":%{ssl_verify_result}}'
  );
}

async function execWhich(cmd: string): Promise<string | null> {
  try {
    const r = await execCmd("which", [cmd], 3);
    const path = r.stdout.trim();
    return path || null;
  } catch {
    return null;
  }
}

function execCmd(
  bin: string,
  args: string[],
  timeoutSec: number
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutSec * 1000);

    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${e.name}: ${e.message}\n${stderr}`, exitCode: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}
