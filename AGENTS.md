# AGENTS.md — AI 协作约定

> 本文件是给 AI 编码助手（Trae / Claude Code / Cursor 等）的持久化指令。
> 任何 AI 会话开始处理本仓库前，必须先遵守以下约定。

## 分支策略（最重要）

| 分支 | 职责 | 允许修改的范围 |
|------|------|---------------|
| `main` | 后端（`app/`、`lib/`）+ Web 前端（`components/`、`app/` 页面） | 除 `weapp/` 外的全部目录 |
| `weapp` | 微信小程序前端（Taro） | **只允许修改 `weapp/` 目录** |

规则：

1. 在 `weapp` 分支上工作时，**禁止修改** `app/`、`lib/`、`components/`、`types/` 等后端/Web 目录。
   - 如果小程序需要新的后端接口：先切到 `main` 实现并推送，再回 `weapp` 分支 `git merge main` 同步使用。
   - 参考先例：微信登录接口（`app/api/auth/weapp/*` + `lib/supabase/server.ts` Bearer 双通道）就是这样合入 main 的。
2. `weapp/` 目录只存在于 `weapp` 分支（main 上被 `.gitignore` 忽略构建产物、`tsconfig.json` 排除类型检查），两分支不会产生合并冲突。
3. 禁止把 `weapp` 分支整体合并到 `main`；也禁止把 `weapp/` 目录提交到 `main`。
4. main 上的后端变更通过定期 `git merge main` 单向同步进 `weapp` 分支。

## 认证架构（勿破坏）

- Web 端：Supabase cookie 会话（`lib/supabase/server.ts` 原链路）。
- 小程序端：`Authorization: Bearer <token>` 双通道（同一文件内新增，优先于 cookie 判定）。
- 两通道共用同一套 Supabase 账号体系，改动 `getCurrentUser` 前必须确认两条链路都不回归。

## 环境与部署

- 生产部署源是 `main`。部署环境需配置 `WEAPP_APPID` / `WEAPP_SECRET`（见 `.env.example`）。
- 小程序本地联调：`weapp/.env` 的 `TARO_APP_API_BASE` 填电脑局域网 IP（不能用 localhost），开发者工具勾选「不校验合法域名」。
- 小程序正式上线前：`TARO_APP_API_BASE` 改为已备案 HTTPS 域名，并在小程序后台登记 request 合法域名；`weapp/project.config.json` 的 appid 从 `touristappid` 改为正式 AppID（该文件含 appid，勿提交真实密钥类文件）。

## 代码规范

- 提交信息用中文，格式 `type(scope): 描述`（如 `feat(weapp): ...`、`fix(auth): ...`）。
- main 上改动需通过 `npx tsc --noEmit`；weapp 上改动需通过 `npm run build:weapp`（在 `weapp/` 目录）。
- API 返回统一 `{ data }` 或 `{ error }` 信封；小程序端请求封装在 `weapp/src/utils/request.ts`（支持 `raw` 选项读 `next_cursor` 等包裹层字段）。
