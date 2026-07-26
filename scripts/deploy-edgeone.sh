#!/usr/bin/env bash
# ============================================================
# 飨刻 - EdgeOne Pages 部署脚本（Bash 版）
#
# 前置条件：
#   1. 已安装 Node.js 18+
#   2. 已安装 edgeone CLI（npm install -g edgeone）
#   3. 已执行 edgeone login 完成登录
#
# 用法：
#   bash scripts/deploy-edgeone.sh
#   或 chmod +x 后直接 ./scripts/deploy-edgeone.sh
# ============================================================

set -euo pipefail

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo -e "${GREEN}[deploy]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[warn]${NC} $1"
}

error() {
  echo -e "${RED}[error]${NC} $1" >&2
}

# ---------- 1. 检查 edgeone CLI ----------
log "检查 edgeone CLI..."
if ! command -v edgeone &> /dev/null; then
  error "未检测到 edgeone CLI"
  echo ""
  echo "请先安装："
  echo "  npm install -g edgeone"
  echo ""
  exit 1
fi

# 显示版本
EDGEONE_VERSION=$(edgeone --version 2>/dev/null || echo "unknown")
log "edgeone CLI 版本: ${EDGEONE_VERSION}"

# ---------- 2. 检查登录状态 ----------
log "检查登录状态..."
# edgeone whoami 在未登录时会返回非零退出码
if ! edgeone whoami &> /dev/null; then
  error "未登录 EdgeOne，请先执行："
  echo "  edgeone login"
  exit 1
fi
log "已登录"

# ---------- 3. 构建项目 ----------
log "开始构建项目（npm run build）..."
# 使用 npm run build，遵循 package.json 中的构建配置
npm run build

# 检查构建产物是否存在
if [ ! -d ".next" ]; then
  error "构建失败：.next 目录不存在"
  exit 1
fi
log "构建完成"

# ---------- 4. 部署到 EdgeOne Pages ----------
log "部署到 EdgeOne Pages..."
# edgeone pages deploy 会自动检测 Next.js 项目并部署
# 如需指定项目名，可使用 --project 参数
edgeone pages deploy

log "部署完成！"
echo ""
echo "提示：可在 EdgeOne 控制台查看部署详情和绑定自定义域名。"
