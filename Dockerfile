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
# CloudBase 容器运行需要 standalone 自包含产物（next.config.ts 读取此变量）
ENV NEXT_OUTPUT=standalone

# 构建期需要的 NEXT_PUBLIC_* 变量（必须在 docker build 阶段拿到真实值，
# 因为它们会被内联进前端 JS bundle，运行时改不了）
#
# 这里【只用 ARG】，绝对不用 ENV！
# 原因：ENV 会写入镜像层并被 runner stage 继承，导致 CloudBase 运行时
# 注入的同名环境变量被镜像内的占位符 BUILD_PLACEHOLDER_* 覆盖。
# ARG 仅对当前 build 阶段有效，不会被继承到最终镜像。
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
# 非 NEXT_PUBLIC_ 变量只在服务端使用，构建期根本不需要注入（由运行时 env 提供）
ARG SUPABASE_SERVICE_ROLE_KEY
ARG QQ_APP_ID
ARG QQ_APP_KEY

# 把 ARG 转成仅对本 RUN shell 生效的 shell 变量，不污染镜像 ENV 层。
# 注意：ENV 指令在本 stage 不会再出现。
#
# 构建前检查：如果 NEXT_PUBLIC_* 没在构建期注入真实值，
# 打印醒目的警告，但不中断构建（因为 entrypoint.sh 会在运行时替换占位符）。
RUN \
  export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-BUILD_PLACEHOLDER_SUPABASE_URL}" && \
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-BUILD_PLACEHOLDER_SUPABASE_ANON_KEY}" && \
  export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-BUILD_PLACEHOLDER_APP_URL}" && \
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

# 容器启动前置脚本：如果 NEXT_PUBLIC_* 构建时没拿到真实值（仍是占位符），
# 会在 .next/static JS chunk 文件里做全局文本替换，把 CloudBase 运行时 env 的真实值写进前端 bundle。
# 脚本放在仓库根目录 entrypoint.sh，不再通过 Dockerfile printf 内联生成，避免多层转义出错。
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

ENTRYPOINT ["entrypoint.sh"]
