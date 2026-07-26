#!/usr/bin/env node
// ============================================================
// 飨刻 - EdgeOne Pages 部署脚本（Node.js 版）
//
// 与 deploy-edgeone.sh 功能一致，通过 child_process 执行。
// 适合在 npm script 中调用：npm run deploy
//
// 前置条件：
//   1. 已安装 Node.js 18+
//   2. 已安装 edgeone CLI（npm install -g edgeone）
//   3. 已执行 edgeone login 完成登录
// ============================================================

import { execSync } from "node:child_process";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const NC = "\x1b[0m";

function log(msg) {
  console.log(`${GREEN}[deploy]${NC} ${msg}`);
}

function warn(msg) {
  console.log(`${YELLOW}[warn]${NC} ${msg}`);
}

function error(msg) {
  console.error(`${RED}[error]${NC} ${msg}`);
}

/**
 * 执行命令，继承 stdio（输出直接透传到终端）
 */
function run(cmd, options = {}) {
  log(`执行: ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...options });
}

/**
 * 检查命令是否存在（静默执行）
 */
function hasCommand(cmd) {
  try {
    execSync(`command -v ${cmd} 2>/dev/null`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // ---------- 1. 检查 edgeone CLI ----------
  log("检查 edgeone CLI...");
  if (!hasCommand("edgeone")) {
    error("未检测到 edgeone CLI");
    console.log("");
    console.log("请先安装：");
    console.log("  npm install -g edgeone");
    console.log("");
    process.exit(1);
  }

  // 显示版本
  try {
    const version = execSync("edgeone --version 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    log(`edgeone CLI 版本: ${version}`);
  } catch {
    warn("无法获取 edgeone 版本（不影响部署）");
  }

  // ---------- 2. 检查登录状态 ----------
  log("检查登录状态...");
  try {
    execSync("edgeone whoami 2>/dev/null", { stdio: "ignore" });
  } catch {
    error("未登录 EdgeOne，请先执行：");
    console.log("  edgeone login");
    process.exit(1);
  }
  log("已登录");

  // ---------- 3. 构建项目 ----------
  log("开始构建项目（npm run build）...");
  run("npm run build");

  // 检查构建产物
  try {
    const stat = execSync('test -d .next && echo "ok"', { encoding: "utf-8" }).trim();
    if (stat !== "ok") throw new Error("no .next dir");
  } catch {
    error("构建失败：.next 目录不存在");
    process.exit(1);
  }
  log("构建完成");

  // ---------- 4. 部署到 EdgeOne Pages ----------
  log("部署到 EdgeOne Pages...");
  run("edgeone pages deploy");

  log("部署完成！");
  console.log("");
  console.log("提示：可在 EdgeOne 控制台查看部署详情和绑定自定义域名。");
}

main().catch((err) => {
  error(`部署失败: ${err.message}`);
  process.exit(1);
});
