# 飨刻 (XiangKe)

> 一个面向小团体（3–20 人）的私密聚餐记录应用，主界面类似微信朋友圈，仅团体成员可见。

## 核心功能

| 功能 | 说明 |
|------|------|
| 团体 Feed | 朋友圈式时间线，按时间倒序，邀请码加入团体 |
| 活动发布 | 纯文字自定义或粘贴美团/点评链接自动解析 |
| 照片墙 | 成员追加照片形成集体相册，九宫格 + 大图查看 |
| 评论点赞 | 一级评论 / 楼中楼回复、点赞、表情互动 |
| 转发 | 带附言转发活动到所属团体 |
| AA 分账 | 活动费用按人均或自定义比例分摊 |
| 美食轮盘 | 团体内随机抽取餐厅，解决「吃什么」难题 |
| AI 文案 | MiniMax 驱动：文案生成、截图识别、账单识别、邀请文案 |
| 收藏地点 | 收藏常去餐厅，截图批量导入并联网补齐信息 |
| 实时同步 | Supabase Realtime 推送新动态 / 评论 / 照片 |
| 更多 | 通知、搜索、活动置顶、RSVP、评分打标、团体统计、PWA |

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui + Radix UI |
| 数据库 / 认证 | Supabase (PostgreSQL + Auth + Realtime) |
| 对象存储 | Cloudflare R2（预签名 URL 直传） |
| AI | MiniMax（OpenAI / Anthropic 兼容接口） |
| 部署 | 腾讯云 CloudBase 云托管（standalone + Docker，国内访问快） |

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填写 Supabase / R2 / AI 等配置

# 3. 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可访问。

## 环境变量

完整变量清单见 [.env.example](./.env.example)，按用途分类：

| 分类 | 关键变量 |
|------|---------|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` |
| Cloudflare R2 | `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET_NAME`、`R2_PUBLIC_URL` |
| AI（MiniMax） | `MINIMAX_API_KEY`（可选 `MINIMAX_MODEL` / `MINIMAX_VISION_MODEL` 等） |
| QQ 互联 | `QQ_APP_ID`、`QQ_APP_KEY`（可选，配置后显示 QQ 登录） |
| 应用 | `NEXT_PUBLIC_APP_URL` |

## 数据库迁移

迁移脚本位于 `supabase/migrations/`，需按编号顺序在 Supabase SQL Editor 中执行：

```
001_init.sql                       # 初始化表结构 / RLS / Feed 函数
002_repoint_fks_to_profiles.sql
003_extended_features.sql          # 通知 / 置顶 / RSVP / 评分等
004_ai_generations.sql             # AI 生成记录
005_favorite_places.sql            # 收藏地点
006_meal_roulette.sql              # 美食轮盘
007_favorite_places_extra.sql
008_favorite_places_enrich.sql
009_live_photo.sql                 # 动态照片
```

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint 检查 |
| `npm run type-check` | TypeScript 类型检查 |
| `npm run test` | 运行单元测试 (Vitest) |
| `npm run test:watch` | 测试监听模式 |
| `npm run test:e2e` | 端到端测试 (Playwright) |
| `npm run verify` | 一键校验：lint + type-check + test + build |

## 目录结构

```
xiangke/
├── app/                # App Router：页面 + API Routes
│   ├── (main)/         # 主框架：feed / activity / groups / meal-roulette ...
│   ├── api/            # Route Handlers（feed、activities、ai、groups、upload ...）
│   └── join/ login/
├── components/         # UI（shadcn/ui）+ 业务组件（feed/activity/group ...）
├── hooks/              # 数据 hooks（useFeed、useActivity、useRealtime ...）
├── lib/                # supabase client、r2、ai、utils、constants
├── types/              # 全局 TypeScript 类型
├── supabase/migrations/# 数据库迁移 SQL（001 ~ 009）
├── e2e/                # Playwright 用例
├── scripts/            # 测试脚本
└── public/             # 静态资源 + PWA manifest
```

## 部署

部署至 [腾讯云 CloudBase 云托管](https://console.cloud.tencent.com/tcb)，基于 `output: 'standalone'` + 多阶段 Dockerfile，完整支持 SSR + API Routes + Middleware，国内访问快。

### 前置准备

1. 注册 [腾讯云账号](https://cloud.tencent.com/) 并开通 [CloudBase 云开发](https://console.cloud.tencent.com/tcb)，记下 **环境 ID**（控制台首页可见）。
2. 安装 CloudBase CLI：`npm i -g @cloudbase/cli`
3. 在 [cloudbaserc.json](./cloudbaserc.json) 中把 `envs.production.envId` 改为你的环境 ID。

### 方式一：CLI 一键部署（推荐）

```bash
# 1. 登录
tcb login

# 2. 部署到云托管（首次会创建服务，端口 3000 与 Dockerfile 一致）
tcb cloudrun deploy --port 3000

# 3. 后续更新：直接重跑上面命令，或绑定 Git 仓库自动部署
```

部署完成后，控制台「云托管 → 服务 → xiangke」会给出默认域名 `https://xiangke-xxx.ap-shanghai.app.tcloudbase.com`，可直接访问。

### 方式二：Git 集成自动部署

在 CloudBase 控制台「云托管 → 服务 → 新建」选「Git 仓库」，绑定 GitHub 仓库和 `main` 分支，平台会自动拉取代码用项目根目录的 [Dockerfile](./Dockerfile) 构建并部署，后续 push 即触发更新。

### 方式三：本地代码上传

控制台「云托管 → 新建服务 → 上传代码」选 ZIP 或文件夹，云端用 Dockerfile build，适合未接 Git 的场景。

### 配置环境变量

部署前在 CloudBase 控制台「云托管 → 服务 → xiangke → 服务设置 → 环境变量」配置（参考 [.env.example](./.env.example)）：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 前端构建期需要，必须配置 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥，仅运行时用 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` | R2 配置 |
| `NEXT_PUBLIC_APP_URL` | 上线后改为实际访问域名，如 `https://xiangke-xxx.ap-shanghai.app.tcloudbase.com` |
| `MINIMAX_API_KEY` | 可选，启用 AI 功能 |
| `QQ_APP_ID` / `QQ_APP_KEY` | 可选，启用 QQ 登录 |

> ⚠️ **重要**：`NEXT_PUBLIC_*` 开头的变量在 Next.js 中是**构建期注入**的。CloudBase 云托管在服务设置里改环境变量后，需要**重新部署一次**（push 代码或重跑 `tcb cloudrun deploy`）才会生效，光改不重新构建不生效。

### 自定义域名（可选）

控制台「云托管 → 服务 → xiangke → 自定义域名」点添加：

1. 填入域名（如 `app.xiangke.app`），平台返回一段 CNAME 值
2. 在 DNS 服务商加 CNAME 记录指向该值
3. 选「自动申请免费证书」（基于 ACME，平台代签）或上传自有证书
4. 等状态变「已生效」

> 国内云托管绑定自定义域名要求域名完成 ICP 备案。CloudBase 默认给的 `*.tcloudbase.com` 子域名无需备案可直接用。

### 注意事项

- [Dockerfile](./Dockerfile) 已配置 `HOSTNAME=0.0.0.0`、非 root 用户运行、standalone 静态资源手动 COPY（`.next/static` 和 `public` standalone 不会自动包含，漏了会 CSS/图片全 404）。
- `images.unoptimized: true` 是 CloudBase 镜像无 Sharp 的妥协，图片优化改由 R2 + CDN 完成。
- AI 视觉接口（[api/ai/*](./app/api/ai)）代码里 `export const maxDuration = 60` 是 Vercel 套餐残留，CloudBase 云托管是长驻进程没有函数超时，不影响使用，但若迁回 Vercel 仍需保留。
- Supabase Auth 回调 URL 要在 Supabase 控制台 **Authentication → URL Configuration** 加上 CloudBase 域名（如 `https://xiangke-xxx.ap-shanghai.app.tcloudbase.com/api/auth/callback`）。

## 许可证

[MIT License](./LICENSE) © 2026 XiangKe Contributors
