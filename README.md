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
| 部署 | EdgeOne Pages |

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
| `npm run deploy` | 部署到 EdgeOne Pages |

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
├── scripts/            # 部署脚本
└── public/             # 静态资源 + PWA manifest
```

## 部署

部署至 EdgeOne Pages（项目已配置 `scripts/deploy-edgeone.mjs`）：

```bash
npm run deploy
```

在 EdgeOne 控制台配置好上述环境变量后即可一键部署，构建产物支持 SSR + API Routes。

## 许可证

[MIT License](./LICENSE) © 2026 XiangKe Contributors
