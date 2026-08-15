# ===== Stage 1: deps =====
FROM node:20-alpine AS deps
WORKDIR /app

# 仅复制 lock 文件，利用 Docker 缓存层
COPY package.json package-lock.json* ./
RUN npm ci

# ===== Stage 2: builder =====
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 关掉 Next.js 遥测，加快构建
ENV NEXT_TELEMETRY_DISABLED=1

# 构建期需要的 NEXT_PUBLIC_* 变量（必须在 docker build 阶段拿到真实值，
# 因为它们会被内联进前端 JS bundle，运行时改不了）
#
# 这里同时接受两种注入方式：
#   1) ARG（docker build --build-arg FOO=xxx 传入）
#   2) 直接 ENV（部分平台会把环境变量直接注入构建进程，无需 --build-arg）
# 优先顺序：ARG 设置了就用 ARG，否则用当前 shell 环境中已有的同名 env。
# 如果都没有，使用 BUILD_ 前缀的占位符，镜像仍能构建成功，
# 等运行时 entrypoint.sh 再用 sed 把这些占位符替换掉（双保险）。
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-BUILD_PLACEHOLDER_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-BUILD_PLACEHOLDER_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-BUILD_PLACEHOLDER_APP_URL}

# 非 NEXT_PUBLIC_ 变量只在服务端使用，构建期占位即可，不影响前端 JS
ENV SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key-build
ENV QQ_APP_ID=placeholder-qq-app-id-build
ENV QQ_APP_KEY=placeholder-qq-app-key-build

# 构建前检查：如果 NEXT_PUBLIC_* 没在构建期注入真实值，
# 打印醒目的警告，但不中断构建（因为 entrypoint.sh 会在运行时替换占位符）。
RUN \
  WARN=0; \
  case "$NEXT_PUBLIC_SUPABASE_URL" in BUILD_PLACEHOLDER*) echo "⚠ WARN: NEXT_PUBLIC_SUPABASE_URL 未在构建期注入（将依赖运行时替换）"; WARN=1;; esac; \
  case "$NEXT_PUBLIC_SUPABASE_ANON_KEY" in BUILD_PLACEHOLDER*) echo "⚠ WARN: NEXT_PUBLIC_SUPABASE_ANON_KEY 未在构建期注入（将依赖运行时替换）"; WARN=1;; esac; \
  case "$NEXT_PUBLIC_APP_URL" in BUILD_PLACEHOLDER*) echo "⚠ WARN: NEXT_PUBLIC_APP_URL 未在构建期注入（将依赖运行时替换）"; WARN=1;; esac; \
  if [ "$WARN" -eq 1 ]; then \
    echo ""; \
    echo "  说明：NEXT_PUBLIC_* 通常需要在 CloudBase【服务设置 → 构建 → 构建参数】里以 --build-arg 传入。"; \
    echo "        如果控制台没有构建参数入口，只需确保【服务设置 → 环境变量】（运行时）里填对，"; \
    echo "        entrypoint.sh 会在容器启动前把 JS chunks 中的占位符替换成真实值。"; \
    echo ""; \
  else \
    echo "✓ NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL"; \
    echo "✓ NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL"; \
    KEY_SHOW="$(printf "%s" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | cut -c1-10)...$(printf "%s" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | tail -c 6)"; \
    echo "✓ NEXT_PUBLIC_SUPABASE_ANON_KEY=$KEY_SHOW"; \
  fi; \
  npm run build

# ===== Stage 3: runner =====
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# CloudBase 云托管默认健康检查打 80 端口，应用必须监听 80
ENV PORT=80
# standalone 默认监听 localhost，容器外访问不到，必须改成 0.0.0.0
ENV HOSTNAME=0.0.0.0

# standalone 产物 + 静态资源（这两个目录 standalone 不会自动复制，必须手动 COPY）
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 在 runner 启动前注入一次环境变量兜底：
# 如果 NEXT_PUBLIC_* 构建时没拿到真实值（仍是 BUILD_PLACEHOLDER_* 或旧版 placeholder.supabase.co），
# 在 .next/static JS chunk 文件里做全局文本替换，让运行时 env 也能改前端 JS。
# 这一步不依赖 build-arg，只要 CloudBase 控制台【运行时环境变量】填对了就行。
RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'echo "[runtime-env-inject] 检查并替换前端 JS chunks 中的 NEXT_PUBLIC 占位符..."' \
  'replace_all() {' \
  '  PATTERN="$1"; VALUE="$2"; TAG="$3";' \
  '  if [ -z "$VALUE" ] || [ -z "$PATTERN" ]; then return 0; fi' \
  '  if [ ! -d "./.next/static" ]; then return 0; fi' \
  '  COUNT=$(grep -rlF "$PATTERN" ./.next/static 2>/dev/null | wc -l)' \
  '  if [ "$COUNT" -gt 0 ]; then' \
  '    VAL_SHOW="$(printf "%s" "$VALUE" | cut -c1-20)...$(printf "%s" "$VALUE" | tail -c 6)"' \
  '    echo "  → [$TAG] 找到 $COUNT 个 chunk 命中，替换为 $VAL_SHOW"' \
  '    grep -rlF "$PATTERN" ./.next/static 2>/dev/null | xargs sed -i "s|$(echo "$PATTERN" | sed "s/[|\\&]/\\\\&/g")|$(echo "$VALUE" | sed "s/[|\\&]/\\\\&/g")|g"' \
  '  fi' \
  '}' \
  '# Supabase URL（同时匹配新占位符和旧版 placeholder.supabase.co）' \
  'replace_all "BUILD_PLACEHOLDER_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_URL" "SUPABASE_URL-new"' \
  'replace_all "https://placeholder.supabase.co" "$NEXT_PUBLIC_SUPABASE_URL" "SUPABASE_URL-legacy"' \
  '# Supabase anon key（同时匹配新占位符和旧版 placeholder-anon-key）' \
  'replace_all "BUILD_PLACEHOLDER_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" "ANON_KEY-new"' \
  'replace_all "placeholder-anon-key" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" "ANON_KEY-legacy"' \
  '# APP URL（新占位符 BUILD_PLACEHOLDER_APP_URL + 旧版 http://localhost:3000 / 0.0.0.0 之类）' \
  'replace_all "BUILD_PLACEHOLDER_APP_URL" "$NEXT_PUBLIC_APP_URL" "APP_URL-new"' \
  'replace_all "http://localhost:3000" "$NEXT_PUBLIC_APP_URL" "APP_URL-legacy-localhost"' \
  'replace_all "http://0.0.0.0" "$NEXT_PUBLIC_APP_URL" "APP_URL-legacy-0000"' \
  'replace_all "http://127.0.0.1:3000" "$NEXT_PUBLIC_APP_URL" "APP_URL-legacy-127"' \
  'echo "[runtime-env-inject] 完成，启动 Next.js server.js"' \
  'exec node server.js "$@"' \
  > /usr/local/bin/entrypoint.sh \
  && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

ENTRYPOINT ["entrypoint.sh"]
