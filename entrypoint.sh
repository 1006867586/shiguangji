#!/bin/sh
# ============================================================================
# Next.js standalone 容器启动前置脚本
#
# 作用：解决 NEXT_PUBLIC_* 变量「必须在构建期写入前端 JS bundle」与
#       「腾讯云 CloudBase 默认只在运行时注入环境变量」的矛盾。
#
# 思路：
#   - 构建期如果没拿到真实 NEXT_PUBLIC_* 值（没有 --build-arg / 构建环境变量），
#     就在 Dockerfile 里写入明确的占位符（BUILD_PLACEHOLDER_SUPABASE_URL 等）；
#   - 容器启动时，在 .next/static 所有 JS chunks 里把占位符全局替换为
#     CloudBase 控制台「运行时环境变量」里设置的真实值；
#   - 兼容旧版本占位符，避免迁移过程中出问题。
#
# 使用方法：
#   Dockerfile 中：
#       COPY entrypoint.sh /usr/local/bin/entrypoint.sh
#       RUN chmod +x /usr/local/bin/entrypoint.sh
#       ENTRYPOINT ["entrypoint.sh"]
# ============================================================================
set -eu

echo "[runtime-env-inject] 检查并替换前端 JS chunks 中的 NEXT_PUBLIC 占位符..."

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
  if [ ! -d "./.next/static" ]; then
    return 0
  fi

  # 先用字面量 grep 统计匹配数（-F 字面量匹配，不会被 &/| 干扰）
  COUNT=$(grep -rlF "${PATTERN}" ./.next/static 2>/dev/null | wc -l)
  if [ "${COUNT}" -gt 0 ]; then
    # 展示真实值前后各一段，避免在日志里泄露完整 anon key
    VAL_SHOW="$(printf "%s" "${VALUE}" | cut -c1-24)...$(printf "%s" "${VALUE}" | tail -c 6)"
    echo "  → [${TAG}] 找到 ${COUNT} 个 chunk 命中，替换为 ${VAL_SHOW}"

    # sed 替换：把模式中需要转义的字符提前转义一遍（&、|、\、/ 四个分隔符相关字符）
    P_ESC="$(printf "%s" "${PATTERN}" | sed -e 's/[\\&|/]/\\&/g')"
    V_ESC="$(printf "%s" "${VALUE}"   | sed -e 's/[\\&|/]/\\&/g')"
    grep -rlF "${PATTERN}" ./.next/static 2>/dev/null | xargs sed -i "s|${P_ESC}|${V_ESC}|g"
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

echo "[runtime-env-inject] 完成，启动 Next.js server.js"
exec node server.js "$@"
