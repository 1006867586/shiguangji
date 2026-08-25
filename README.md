# 飨刻 (XiangKe)

> 一个面向小团体（3–20 人）的私密聚餐记录应用，主界面类似微信朋友圈，仅团体成员可见。

## 核心功能

| 功能 | 说明 |
|------|------|
| 团体 Feed | 朋友圈式时间线，按时间倒序，邀请码加入团体 |
| 活动发布 | 纯文字自定义；或粘贴美团/点评分享文本自动解析，截图 AI 识别一键回填 |
| 信息补齐 | 链接解析 / 截图识别后，按店名用**高德 POI（优先）/ 百度**补全电话、地址、评分、人均、封面图、坐标 |
| 照片墙 | 成员追加照片形成集体相册，九宫格 + 大图查看 |
| 评论点赞 | 一级评论 / 楼中楼回复、点赞、表情互动 |
| 转发 | 带附言转发活动到所属团体 |
| AA 分账 | 活动费用按人均或自定义比例分摊 |
| 美食轮盘 | 团体内随机抽取餐厅，解决「吃什么」难题（支持自定义抽取池） |
| AI 文案 | MiniMax 驱动：文案生成、截图识别、账单识别、邀请文案 |
| 收藏地点 | 收藏常去餐厅，截图批量导入并联网补齐信息（高德 POI 按店名兜底） |
| 地图打卡 | 发布动态带坐标，收藏夹/打卡照在地图上落点展示 |
| 实时同步 | Supabase Realtime 推送新动态 / 评论 / 照片 |
| 更多 | 通知、搜索、活动置顶、RSVP、评分打标、用户成长体系与作者成就、团体统计与解散、PWA |

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui + Radix UI |
| 数据库 / 认证 | Supabase (PostgreSQL + Auth + Realtime) |
| 对象存储 | Cloudflare R2（预签名 URL 直传） |
| 地图 | 高德地图（Web JS + Web 服务端 POI）、百度地图（POI 兜底） |
| 小程序 | 微信小程序（Taro，位于独立 `weapp` 分支） |
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
| 地图（POI 补齐） | `AMAP_KEY`（高德 Web 服务）、`NEXT_PUBLIC_AMAP_JS_KEY`（高德前端）、`BAIDU_MAP_AK` / `BAIDU_MAP_SK`（百度兜底） |
| 微信登录 | `WEAPP_APPID`、`WEAPP_SECRET`、`WEAPP_QR_ENV` |
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
010_feed_rpc_extra_fields.sql
011_roulette_pools.sql             # 轮盘自定义抽取池
012_feed_keyword.sql               # Feed 关键词搜索
013_wechat_login_sessions.sql      # 微信登录 Session
014_group_invite_preview.sql
015_group_dissolve.sql             # 团体解散
016_user_gamification.sql          # 用户成长体系
017_author_achievements.sql        # 作者成就
018_food_checkin_map.sql           # 美食打卡地图
019_favorite_places_coords.sql     # 收藏地点坐标
021_places_rich_info.sql           # 收藏地点富信息
022_places_cover_image.sql         # 收藏地点封面图
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
├── components/         # UI（shadcn/ui）+ 业务组件（feed/activity/group/map ...）
├── hooks/              # 数据 hooks（useFeed、useActivity、useRealtime ...）
├── lib/                # supabase client、r2、ai、utils、constants、poi
│   └── poi/            # 地图 POI 匹配（高德/百度）与补齐编排
├── types/              # 全局 TypeScript 类型
├── supabase/migrations/# 数据库迁移 SQL（001 ~ 022）
├── e2e/                # Playwright 用例
├── scripts/            # 测试脚本
└── public/             # 静态资源 + PWA manifest
```

> **微信小程序**：独立 Taro 工程位于 `weapp` 分支的 `weapp/` 目录，不在本分支（`main`）中。详见 [AGENTS.md](./AGENTS.md) 的分支策略。

## 部署

项目为 Next.js 全栈应用（SSR + API Routes + Middleware），可在 **CloudBase 云托管**、**CloudBase EdgeOne Pages** 或 **Vercel** 三处部署。默认构建保持平台原生产物（`output` 由 [next.config.ts](./next.config.ts) 控制，仅 Docker 部署时设 `NEXT_OUTPUT=standalone` 启用 standalone），三平台通用。

### 腾讯云 CloudBase 云托管

部署至 [腾讯云 CloudBase 云托管](https://console.cloud.tencent.com/tcb)，基于 `output: 'standalone'` + 多阶段 Dockerfile，完整支持 SSR + API Routes + Middleware，国内访问快。

#### 前置准备

1. 注册 [腾讯云账号](https://cloud.tencent.com/) 并开通 [CloudBase 云开发](https://console.cloud.tencent.com/tcb)，记下 **环境 ID**（控制台首页可见）。
2. 安装 CloudBase CLI：`npm i -g @cloudbase/cli`
3. 在 [cloudbaserc.json](./cloudbaserc.json) 中把 `envs.production.envId` 改为你的环境 ID。

#### 方式一：CLI 一键部署（推荐）

```bash
# 1. 登录
tcb login

# 2. 部署到云托管（首次会创建服务，端口 80 与 Dockerfile 一致）
tcb cloudrun deploy --port 80

# 3. 后续更新：直接重跑上面命令，或绑定 Git 仓库自动部署
```

部署完成后，控制台「云托管 → 服务 → xiangke」会给出默认域名 `https://xiangke-xxx.ap-shanghai.app.tcloudbase.com`，可直接访问。

#### 方式二：Git 集成自动部署

在 CloudBase 控制台「云托管 → 服务 → 新建」选「Git 仓库」，绑定 GitHub 仓库和 `main` 分支，平台会自动拉取代码用项目根目录的 [Dockerfile](./Dockerfile) 构建并部署，后续 push 即触发更新。

#### 方式三：本地代码上传

控制台「云托管 → 新建服务 → 上传代码」选 ZIP 或文件夹，云端用 Dockerfile build，适合未接 Git 的场景。

#### 配置环境变量

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

#### 自定义域名（可选）

控制台「云托管 → 服务 → xiangke → 自定义域名」点添加：

1. 填入域名（如 `app.xiangke.app`），平台返回一段 CNAME 值
2. 在 DNS 服务商加 CNAME 记录指向该值
3. 选「自动申请免费证书」（基于 ACME，平台代签）或上传自有证书
4. 等状态变「已生效」

> 国内云托管绑定自定义域名要求域名完成 ICP 备案。CloudBase 默认给的 `*.tcloudbase.com` 子域名无需备案可直接用。

#### 注意事项

- [Dockerfile](./Dockerfile) 已配置 `HOSTNAME=0.0.0.0`、非 root 用户运行、standalone 静态资源手动 COPY（`.next/static` 和 `public` standalone 不会自动包含，漏了会 CSS/图片全 404）。
- `images.unoptimized: true` 是 CloudBase 镜像无 Sharp 的妥协，图片优化改由 R2 + CDN 完成。
- AI 视觉接口（[api/ai/*](./app/api/ai)）代码里 `export const maxDuration = 60` 是 Vercel 套餐残留，CloudBase 云托管是长驻进程没有函数超时，不影响使用，但若迁回 Vercel 仍需保留。
- Supabase Auth 回调 URL 要在 Supabase 控制台 **Authentication → URL Configuration** 加上 CloudBase 域名（如 `https://xiangke-xxx.ap-shanghai.app.tcloudbase.com/api/auth/callback`）。

### 腾讯云 CloudBase EdgeOne Pages

基于 EdgeOne 全球边缘加速 + Serverless，零配置原生支持 Next.js，国内访问快，适配 SSR / ISR。项目根目录已内置 [edgeone.json](./edgeone.json)（构建命令、输出目录 `.next`、Node 22、云函数超时 60s）。由于是 Next.js 全栈应用，EdgeOne 会把 [app/api/**](./app/api) 的 Route Handlers 自动编排为 Cloud Functions。

#### 方式一：Git 集成部署（推荐）

1. 登录 [EdgeOne 控制台 → Pages](https://console.cloud.tencent.com/edgeone/pages)，点「创建项目」并授权关联 GitHub 仓库。
2. 选择本项目与 `main` 分支，构建命令填 `npm run build`，输出目录填 `.next`（已由 `edgeone.json` 覆盖，通常无需再填）。
3. 在「项目设置 → 环境变量」配置 `.env.example` 中除 `NEXT_PUBLIC_*` 外的全部变量（`NEXT_PUBLIC_*` 会自动从仓库读取或需手动添加，见下方注意事项）。
4. 点「开始部署」，后端 API 会自动成为云函数随项目一并上线；后续 push 即触发更新。

#### 方式二：CLI 部署（可选）

```bash
# 1. 安装并登录 EdgeOne CLI
npm i -g @cloudbase/cli edgeone-cli
edgeone login

# 2. 构建并部署（edgeone.json 已配置 nodeVersion / outputDirectory / cloudFunctions）
# 三部曲：构建产物 → 关联云函数 → 发布
```

#### 注意事项

- `NEXT_PUBLIC_*` 变量是**构建期注入**的：部署前必须在 EdgeOne 项目「环境变量」完整添加（含 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_ANON_KEY`、`NEXT_PUBLIC_APP_URL`、`NEXT_PUBLIC_AMAP_JS_KEY`），改后需重新部署才生效。
- AI 接口（[api/ai/*](./app/api/ai)）依赖 `export const maxDuration = 60`，项目 `edgeone.json` 已设 `cloudFunctions.maxDuration = 60`，无需改动。
- 图片已设 `images.unoptimized: true`，无 Sharp 依赖，EdgeOne 端无需额外处理。
- Supabase Auth 回调 URL 需把 EdgeOne 分配的默认域名或自定义域名加入 **Authentication → URL Configuration**。
- 国内加速区域绑定自定义域名需 ICP 备案，海外区域则无需。

### Vercel

原生托管 Next.js，无需任何部署配置即可跑通 SSR + API Routes + Route Handlers + Middleware（本仓库未附 `vercel.json`，Vercel 自动识别 App Router 并用 `output: 'file tracing'` 处理）。适合海外访问或临时预览。

#### 部署步骤

1. 在 [Vercel](https://vercel.com) 导入 GitHub 仓库并连到 `main` 分支，框架自动识别为 Next.js。
2. 在 **Settings → Environment Variables** 配置 `.env.example` 中的变量（含全部 `NEXT_PUBLIC_*`，它们会在构建期注入）。
3. 构建命令默认 `npm run build`（或按提示生成），输出目录无需配置（Vercel 自动处理 `.next`）。
4. 点击 Deploy；首次部署会生成 `https://xiangke.vercel.app` 预览域名，后续 push 自动触发。

#### 注意事项

- `NEXT_PUBLIC_*` 变量需在构建期注入，必须在部署前于 Settings 中配置完整，改后重新部署生效。
- AI 接口的 `export const maxDuration = 60` 在 Vercel 需配套 Plan 支持（超时上限）；Hobby 免费计划限制 60s，刚好覆盖，超出需升级。
- 图片已设 `images.unoptimized: true`，Vercel 上可用（仅少边缘压缩），无需改造。
- 生产域名（自定义域名）需加入 Supabase **Authentication → URL Configuration**；Vercel 默认的 `*.vercel.app` 微信/QQ 授权回调需以实际主域名配置。
- 国内访问 Vercel 域名网络不稳定，如需面向国内用户建议优先用 CloudBase 云托管或 EdgeOne。

## 许可证

[MIT License](./LICENSE) © 2026 XiangKe Contributors
