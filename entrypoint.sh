#!/bin/sh
# ============================================================================
# Next.js standalone 容器启动前置脚本
#
# 作用：解决 NEXT_PUBLIC_* 变量「必须在构建期写入前端 JS bundle」与
#       「腾讯云 CloudBase 默认只在运行时注入环境变量」的矛盾。
#
# 关键背景：
#   Next.js 在 build 时会把 process.env.NEXT_PUBLIC_* 的值内联到
#   .next/static（前端 chunks）和 .next/server（服务端代码）的所有 JS 文件里。
#   如果构建期 env 是占位符 BUILD_PLACEHOLDER_*，那么所有 JS 文件里
#   都是占位符字面量，运行时改 process.env 无效（已被内联）。
#
# 思路：
#   1) 容器启动时，在 .next/static + .next/server + server.js 所有 JS 里
#      把占位符全局替换为 CloudBase 运行时 env 的真实值
#   2) 同时 export 到 shell 环境，让未内联的 process.env 读取也能拿到真实值
# ============================================================================
set -eu

echo "[runtime-env-inject] 检查并替换 JS 中的 NEXT_PUBLIC 占位符..."

# 要搜索的目录列表：前端 chunks + 服务端代码 + standalone server
SEARCH_DIRS=""
if [ -d "./.next/static" ]; then
  SEARCH_DIRS="./.next/static"
fi
if [ -d "./.next/server" ]; then
  if [ -n "${SEARCH_DIRS}" ]; then
    SEARCH_DIRS="${SEARCH_DIRS} ./.next/server"
  else
    SEARCH_DIRS="./.next/server"
  fi
fi
# server.js 在 standalone 根目录
if [ -f "./server.js" ]; then
  # 把 server.js 单独加入搜索（grep -r 对单文件也行）
  if [ -n "${SEARCH_DIRS}" ]; then
    SEARCH_DIRS="${SEARCH_DIRS} ./server.js"
  else
    SEARCH_DIRS="./server.js"
  fi
fi

if [ -z "${SEARCH_DIRS}" ]; then
  echo "  ⚠ 未找到 .next/static 或 .next/server，跳过替换"
  SEARCH_DIRS="/dev/null"
fi

echo "  搜索范围: ${SEARCH_DIRS}"

# ----------------------------------------------------------------------------
# 通用替换函数：grep 所有命中占位符的 JS 文件，用 sed 原地替换为真实值
# $1 = 要搜索/替换的占位符字符串（字面量，非正则）
# $2 = 替换成的真实值
# $3 = 日志标签（用来区分新/旧占位符）
# ----------------------------------------------------------------------------
replace_all() {
  PATTERN="$1"
  VALUE="$2"
  TAG="$3"

  if [ -z "${VALUE}" ] || [ -z "${PATTERN}" ]; then
    return 0
  fi

  # 先用字面量 grep 统计匹配数（-F 字面量匹配，不会被 &/| 干扰）
  COUNT=$(grep -rlF "${PATTERN}" ${SEARCH_DIRS} 2>/dev/null | wc -l)
  if [ "${COUNT}" -gt 0 ]; then
    # 展示真实值前后各一段，避免在日志里泄露完整 anon key
    VAL_SHOW="$(printf "%s" "${VALUE}" | cut -c1-24)...$(printf "%s" "${VALUE}" | tail -c 6)"
    echo "  → [${TAG}] 找到 ${COUNT} 个文件命中，替换为 ${VAL_SHOW}"

    # sed 替换：把模式中需要转义的字符提前转义一遍（&、|、\、/ 四个分隔符相关字符）
    P_ESC="$(printf "%s" "${PATTERN}" | sed -e 's/[\\&|/]/\\&/g')"
    V_ESC="$(printf "%s" "${VALUE}"   | sed -e 's/[\\&|/]/\\&/g')"
    grep -rlF "${PATTERN}" ${SEARCH_DIRS} 2>/dev/null | xargs sed -i "s|${P_ESC}|${V_ESC}|g"
  else
    echo "  → [${TAG}] 无命中"
  fi
}

# ----------------------------------------------------------------------------
# Supabase URL：匹配「新占位符 BUILD_PLACEHOLDER_*」+「旧版 https://placeholder.supabase.co」
# ----------------------------------------------------------------------------
replace_all "BUILD_PLACEHOLDER_SUPABASE_URL"        "${NEXT_PUBLIC_SUPABASE_URL}"        "SUPABASE_URL-new"
replace_all "https://placeholder.supabase.co"       "${NEXT_PUBLIC_SUPABASE_URL}"        "SUPABASE_URL-legacy"

# ----------------------------------------------------------------------------
# Supabase anon key：匹配「新占位符 BUILD_PLACEHOLDER_*」+「旧版 placeholder-anon-key」
# ----------------------------------------------------------------------------
replace_all "BUILD_PLACEHOLDER_SUPABASE_ANON_KEY"   "${NEXT_PUBLIC_SUPABASE_ANON_KEY}"   "ANON_KEY-new"
replace_all "placeholder-anon-key"                  "${NEXT_PUBLIC_SUPABASE_ANON_KEY}"   "ANON_KEY-legacy"

# ----------------------------------------------------------------------------
# APP URL（主要用在 OAuth 回调 emailRedirectTo / nextUrl 里，构建期可能写入前端）
# 新占位符 BUILD_PLACEHOLDER_APP_URL + 常见 localhost/0.0.0.0 组合
# ----------------------------------------------------------------------------
replace_all "BUILD_PLACEHOLDER_APP_URL"             "${NEXT_PUBLIC_APP_URL}"             "APP_URL-new"
replace_all "http://localhost:3000"                 "${NEXT_PUBLIC_APP_URL}"             "APP_URL-legacy-localhost"
replace_all "http://0.0.0.0"                        "${NEXT_PUBLIC_APP_URL}"             "APP_URL-legacy-0000"
replace_all "http://0.0.0.0:3000"                   "${NEXT_PUBLIC_APP_URL}"             "APP_URL-legacy-0000-3000"
replace_all "http://127.0.0.1:3000"                 "${NEXT_PUBLIC_APP_URL}"             "APP_URL-legacy-127"

# ============================================================================
# 关键修复：确保服务端 process.env 也有真实值
#
# 问题：
#   Next.js build 时会把 NEXT_PUBLIC_* 内联到 JS 文件里（上面已替换）。
#   但服务端代码中 process.env.SUPABASE_SERVICE_ROLE_KEY 等非 NEXT_PUBLIC_
#   变量不会被内联，运行时从 process.env 读取。
#   CloudBase 控制台设置的「环境变量」可能不会自动注入到容器内
#   Node.js 的 process.env 中（取决于平台注入方式）。
#
# 方案：
#   在 entrypoint.sh 里显式 export 这些变量，确保 Node.js process.env
#   能读到真实值。
# ============================================================================

echo ""
echo "[runtime-env-inject] 检查服务端环境变量..."

# 检查并 export 每个变量
ensure_env() {
  VAR_NAME="$1"
  TAG="$2"

  # 用 eval 读取变量值（sh 不支持 ${!VAR} 间接引用）
  CURRENT_VAL="$(eval echo "\${${VAR_NAME}:-}")"

  if [ -z "${CURRENT_VAL}" ]; then
    echo "  ⚠ [${TAG}] ${VAR_NAME} 为空（CloudBase 未注入？请检查控制台【服务设置 → 环境变量】）"
    return 0
  fi

  # 检测是否是占位符
  case "${CURRENT_VAL}" in
    BUILD_PLACEHOLDER*)
      echo "  ⚠ [${TAG}] ${VAR_NAME} 仍是占位符: ${CURRENT_VAL}"
      echo "    → CloudBase 控制台可能未设置此变量"
      return 0
      ;;
    placeholder-*)
      echo "  ⚠ [${TAG}] ${VAR_NAME} 仍是旧版占位符: ${CURRENT_VAL}"
      return 0
      ;;
    *)
      # 真实值 → 显式 export 确保 Node.js process.env 能读到
      eval "export ${VAR_NAME}=\"${CURRENT_VAL}\""
      VAL_SHOW="$(printf "%s" "${CURRENT_VAL}" | cut -c1-24)...$(printf "%s" "${CURRENT_VAL}" | tail -c 6)"
      echo "  ✓ [${TAG}] ${VAR_NAME} = ${VAL_SHOW}（已 export）"
      ;;
  esac
}

ensure_env "NEXT_PUBLIC_SUPABASE_URL"       "SUPABASE_URL"
ensure_env "NEXT_PUBLIC_SUPABASE_ANON_KEY"  "ANON_KEY"
ensure_env "NEXT_PUBLIC_APP_URL"           "APP_URL"
ensure_env "SUPABASE_SERVICE_ROLE_KEY"     "SERVICE_ROLE_KEY"
ensure_env "QQ_APP_ID"                    "QQ_APP_ID"
ensure_env "QQ_APP_KEY"                    "QQ_APP_KEY"

echo ""
echo "[runtime-env-inject] 完成，启动 Next.js server.js"
exec node server.js "$@"
