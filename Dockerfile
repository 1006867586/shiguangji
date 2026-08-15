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

# 构建期需要的环境变量（仅占位，运行时凭据由 CloudBase 控制台注入）
# CI 中校验 env 存在性即可通过
ARG NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npm run build

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

EXPOSE 80

# standalone 入口是 server.js，跳过 npm 一层启动更快
CMD ["node", "server.js"]
