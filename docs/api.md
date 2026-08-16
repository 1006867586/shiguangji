# POI 匹配 API 文档

通过高德/百度地图官方 POI 检索接口，对美团/点评等平台解析出的店铺名进行多级降级匹配，补齐电话、地址、品类、评分等信息。

## 目录

- [主流程集成](#主流程集成)
- [PATCH /api/favorite-places/[id]](#patch-apifavorite-placesid)
- [POST /api/favorite-places](#post-apifavorite-places)
- [POST /api/places/match-poi](#post-apiplacesmatch-poi)
- [POST /api/link-preview](#post-apilink-preview)
- [匹配算法说明](#匹配算法说明)
- [前端地图唤起](#前端地图唤起)
- [小程序认证（weapp 分支）](#小程序认证weapp-分支)
- [小程序内容安全（msgSecCheck）](#小程序内容安全msgseccheck)
- [小程序码（wxacode）](#小程序码wxacode)
- [错误码参考](#错误码参考)
- [环境变量](#环境变量)

---

## 主流程集成

收藏夹导入的完整链路：

```
上传截图 → AI 识别店铺列表 → 用户确认
    → POST /api/favorite-places（enrichPoi: true）
        ├─ 批量入库
        └─ 地图 POI 匹配补齐（电话/地址/品类/评分）
→ 需要封面图/店铺链接时 → POST /api/ai/enrich-place（AI 联网搜索）
```

发起聚餐的链接解析链路：

```
粘贴美团/点评分享文本或链接
    → POST /api/link-preview
        ├─ 解析分享文本（店名/地址/电话）
        ├─ 抓取商家页 og meta（封面图/评分/人均）
        └─ 电话/地址仍缺失 → 地图 POI 匹配兜底补齐
```

> 背景：美团/点评商家 share 页对**电话与详细地址打码**（产品策略），
> 分享文本没带【地址】【电话】时这两个字段此前只能手动填，
> 现在由 POI 匹配自动补齐。

两条补齐通道职责互补：

| 通道 | 数据源 | 补齐字段 | 特点 |
|------|--------|---------|------|
| POI 匹配 | 高德/百度官方接口 | phone / address / category / rating | 快（~1s/条）、准确、仅填空字段 |
| AI 联网搜索 | MiniMax web_search | cover_image_url / store_url | 慢（10-30s/条）、覆盖面广 |

**前端行为**：收藏夹截图导入保存时自动传 `enrichPoi: true`；服务端未配置地图 Key 时静默跳过，不影响入库。

---

## PATCH /api/favorite-places/[id]

编辑单条店铺收藏（白名单字段，全部可选局部更新）。需登录，只能改自己的。

### 请求

```http
PATCH /api/favorite-places/{id}
Content-Type: application/json
```

```json
{
  "title": "海底捞（望京店）",
  "address": "北京市朝阳区望京街1号",
  "phone": "010-64786666",
  "store_url": "https://www.haidilao.com",
  "signature_dishes": ["番茄锅", "捞面"],
  "rating": 4.7,
  "price": "￥120",
  "category": "火锅",
  "summary": "服务好，适合聚餐",
  "platform": "dianping"
}
```

### 字段说明

| 字段 | 类型 | 校验 |
|------|------|------|
| `title` | string | 传则必须非空（trim 后） |
| `address` / `phone` / `category` / `price` | string \| null | 空串自动转 null |
| `store_url` | string \| null | 需 http(s):// 开头 |
| `signature_dishes` | string[] | 自动 trim + 去空项 |
| `rating` | number \| null | 0-5，保留一位小数；null 清空 |
| `summary` | string | trim 后保存 |
| `platform` | enum | meituan/dianping/xiaohongshu/douyin/unknown |

### 响应

```json
{ "data": { "id": "...", "title": "海底捞（望京店）", "...": "..." } }
```

| 状态码 | 场景 |
|--------|------|
| 200 | 更新成功，返回更新后的完整行 |
| 400 | 店名为空 / 评分越界 / 链接格式错误 / 无可更新字段 |
| 401 | 未登录 |
| 404 | 收藏不存在或不属于当前用户 |
| 409 | 改后与其他店铺同名同地址（唯一索引冲突） |

**前端行为**：收藏夹列表 hover 显示铅笔按钮 → 弹「编辑店铺」对话框；乐观更新 + 失败回滚。

---

## POST /api/favorite-places

批量创建店铺收藏，可选开启 POI 自动补齐。需登录。

### 请求

```http
POST /api/favorite-places
Content-Type: application/json
```

```json
{
  "platform": "dianping",
  "sourceScreenshotUrl": "https://img.example.com/screenshot.jpg",
  "enrichPoi": true,
  "city": "武汉",
  "places": [
    {
      "title": "狮龙聚会·青山老牌烧烤(恩施街店)",
      "address": null,
      "phone": null,
      "signatureDishes": ["烤面筋"],
      "summary": "老牌烧烤",
      "rating": 4.6,
      "averagePrice": "￥80",
      "category": "烧烤"
    }
  ]
}
```

### 请求体参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `places` | `Place[]` | 是 | 1-50 条店铺 |
| `places[].title` | `string` | 是 | 店铺名 |
| `places[].address` | `string \| null` | 否 | 地址（截图识别值） |
| `places[].phone` | `string \| null` | 否 | 电话（截图识别值） |
| `places[].signatureDishes` | `string[]` | 否 | 招牌菜 |
| `places[].summary` | `string` | 否 | 简介 |
| `places[].rating` | `number \| null` | 否 | 评分 0-5 |
| `places[].averagePrice` | `string \| null` | 否 | 人均，如 "￥80" |
| `places[].category` | `string \| null` | 否 | 品类，如 烧烤 |
| `platform` | `string` | 否 | `meituan` / `dianping` / `xiaohongshu` / `douyin` / `unknown` |
| `sourceScreenshotUrl` | `string` | 否 | 来源截图 URL |
| `enrichPoi` | `boolean` | 否 | 入库后自动跑地图 POI 匹配，默认 `false` |
| `city` | `string` | 否 | 城市名，限定 POI 检索范围、显著提升命中率 |

### 响应 200

```json
{
  "data": [
    {
      "id": "b3f5a2e1-…",
      "title": "狮龙聚会·青山老牌烧烤(恩施街店)",
      "address": "恩施街10号",
      "phone": "027-86512345",
      "category": "烧烤",
      "rating": 4.6
    }
  ],
  "inserted": 1,
  "duplicated": 0,
  "poiEnriched": {
    "patches": [
      {
        "id": "b3f5a2e1-…",
        "updates": { "address": "恩施街10号", "phone": "027-86512345" },
        "tier": "high",
        "confidence": 0.92
      }
    ],
    "matched": 1,
    "unmatched": 0,
    "skipped": 0,
    "errors": [],
    "budgetExhausted": 0
  }
}
```

| 字段 | 说明 |
|------|------|
| `data` | 新入库的店铺（已合并 POI 补齐结果，无需二次拉取） |
| `inserted` / `duplicated` | 新增数 / 与已有收藏重复跳过数 |
| `poiEnriched` | POI 补齐统计；`enrichPoi=false` 或未配置地图 Key 时为 `null` |
| `poiEnriched.matched` | high/medium 置信命中并已写库的条数 |
| `poiEnriched.unmatched` | 置信度不足（low/none）未写入的条数 |
| `poiEnriched.skipped` | 电话/地址/品类原本就完整、未参与匹配的条数 |
| `poiEnriched.budgetExhausted` | 超出 35s 时间预算未处理的条数（可在详情页手动补齐） |
| `poiEnriched.errors` | 匹配或写库出错的行（不影响入库本身） |

### 补齐规则

- 仅 `high`（≥0.85）与 `medium`（≥0.7）置信命中会写库；`low` 档保留在统计中供人工复核
- **只填空字段**：截图已识别出的电话/地址/品类/评分不会被覆盖
- 单条匹配失败不阻塞整批；时间预算耗尽后剩余行跳过

### 错误响应

| 状态码 | 场景 |
|--------|------|
| 400 | `places` 为空 / 超 50 条 / 无有效条目 |
| 401 | 未登录 |
| 500 | 数据库错误（含错误码与消息） |

---

## POST /api/places/match-poi

对单个店铺名执行多级降级 POI 匹配，返回候选与置信度。需登录。适合手动补齐、二次确认等场景。

### 请求

```http
POST /api/places/match-poi
Content-Type: application/json
```

```json
{
  "name": "狮龙聚会·青山老牌烧烤(恩施街店)",
  "city": "武汉",
  "phone": "027-86512345",
  "category": "烧烤"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 店铺名（1-100 字符） |
| `city` | `string` | 否 | 城市名，强烈建议提供 |
| `phone` | `string` | 否 | 已知电话，一致时置信度 +0.15 |
| `category` | `string` | 否 | 已知品类，一致时置信度 +0.05 |

### 响应 200

```json
{
  "data": {
    "matched": true,
    "tier": "high",
    "confidence": 0.92,
    "candidate": {
      "provider": "amap",
      "id": "B0FFG9xyz",
      "name": "狮龙聚会·青山老牌烧烤(恩施街店)",
      "address": "恩施街10号",
      "phone": "027-86512345",
      "city": "武汉市",
      "category": "烧烤",
      "rating": 4.5,
      "price": 80,
      "url": null,
      "location": { "lng": 114.35, "lat": 30.62, "coordType": "gcj02" }
    },
    "attempts": [
      { "level": 1, "keyword": "狮龙聚会·青山老牌烧烤(恩施街店)", "provider": "amap", "candidateCount": 1 },
      { "level": 1, "keyword": "狮龙聚会·青山老牌烧烤(恩施街店)", "provider": "baidu", "candidateCount": 0 },
      { "level": 2, "keyword": "狮龙聚会·青山老牌烧烤", "provider": "baidu", "candidateCount": 2 }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `matched` | `tier` 为 high/medium 时 `true`；low 返回候选但需人工确认 |
| `tier` | `high` / `medium` / `low` / `none` |
| `confidence` | 综合置信度 0-1 |
| `candidate` | 最佳候选；`tier=none` 时为 `null` |
| `candidate.provider` | `amap`（高德）或 `baidu`（百度） |
| `candidate.location.coordType` | 高德 GCJ-02 / 百度 BD-09，落库或展示时注意坐标系转换 |
| `attempts` | 每级查询词 × 每平台的检索轨迹，含错误信息，便于审计 |

### 错误响应

| 状态码 | 场景 |
|--------|------|
| 400 | `name` 缺失或超长 |
| 401 | 未登录 |
| 502 | 地图接口调用失败（Key 无效 / 参数错误 / 超时） |
| 503 | 未配置任何地图 Key |

---

## POST /api/link-preview

解析美团/点评分享文本或纯链接，回填活动表单的商家信息卡片。需登录。

### 请求

```http
POST /api/link-preview
Content-Type: application/json
```

```json
{ "url": "【雾都小馆】快来试试这家餐厅吧！【地址：江岸区云林街14号1楼2号】【电话：15347053039】@大众点评 http://dpurl.cn/BNE9Tdaz" }
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 分享文本（含店名/地址/电话/短链）或纯 URL |

### 响应 200

```json
{
  "data": {
    "platform": "dianping",
    "url": "http://dpurl.cn/BNE9Tdaz",
    "title": "雾都小馆",
    "coverImage": "https://p0.meituan.net/cover.jpg",
    "address": "江岸区云林街14号1楼2号",
    "phone": "15347053039",
    "rating": 4.4,
    "price": "¥67/人",
    "category": "川菜"
  }
}
```

### 解析策略（按优先级）

| 步骤 | 来源 | 字段 | 说明 |
|------|------|------|------|
| 1 | 分享文本正则 | title / address / phone / platform | 【店名】【地址：x】【电话：x】@美团 |
| 2 | 商家页 SSR HTML | coverImage / rating / price | og:image、可见文本评分与人均；**电话/地址被打码** |
| 3 | 地图 POI 匹配 | phone / address / category / rating | 仍缺失时用店名跑高德/百度匹配；仅 high/medium 置信写入，只填空字段 |

- 未配置地图 Key 时步骤 3 自动跳过，行为与旧版一致
- POI 匹配失败/低置信不报错，字段留空由用户在表单中手动编辑
- 仅允许抓取美团/点评域名（SSRF 防护），其他域名返回 `fallback: true` 由前端降级为手动编辑

### 错误响应

| 状态码 | 场景 |
|--------|------|
| 400 | `url` 为空 |
| 401 | 未登录 |
| 500 | 解析异常（非美团/点评域名会返回提示信息） |

---

## 匹配算法说明

### 多级查询词降级

```
原始名 → 清洗名 → 核心品牌
```

| 级别 | 示例输入 | 查询词 |
|------|---------|--------|
| 1 原始名 | `狮龙聚会·青山老牌烧烤(恩施街店)` | `狮龙聚会·青山老牌烧烤(恩施街店)` |
| 2 清洗名 | 同上 | `狮龙聚会·青山老牌烧烤` |
| 3 核心品牌 | 同上 | `狮龙聚会` |

清洗规则：去全角/半角/方头括号分店后缀、`·分店`尾缀、emoji、装饰符号（`★☆|/` 等）、尾部「旗舰店/总店」字样。任一级出现 high 置信命中即提前结束，节省配额。

### 相似度打分

```
confidence = 名称相似度 + 电话一致(+0.15) + 品类一致(+0.05)，上限 1
```

- 名称相似度：归一化（小写、去符号）后，相等为 1；包含关系 0.75 起按长度比加权；其余按编辑距离衰减
- 电话比对：`+86`/区号/分隔符归一化后全等，或有效位 ≥7 时后缀对齐（兼容「带区号 vs 不带」）

### 置信度分级

| tier | 阈值 | 处理 |
|------|------|------|
| high | ≥ 0.85 | 直接采信写库 |
| medium | ≥ 0.70 | 视为匹配写库 |
| low | ≥ 0.55 | 不写库，保留候选供人工复核 |
| none | < 0.55 | 丢弃 |

### 服务端库引用

```ts
import { matchPoi, enrichPlacesWithPoi, enrichLinkWithPoi } from "@/lib/poi";
```

- `matchPoi(input, deps?)`：单条匹配，支持注入搜索函数（测试/扩展数据源）
- `enrichPlacesWithPoi(places, opts?)`：批量串行编排（默认 150ms 间隔），支持 `timeBudgetMs` 超时预算，仅生成「填空字段」补丁
- `enrichLinkWithPoi(link, opts?)`：单条 ExternalLink 兜底（链接解析用），仅补缺失的电话/地址/品类/评分，失败返回原链接

---

## 前端地图唤起

点击地址唤起高德/百度/Apple 地图 App，支持安卓、鸿蒙、iOS 三平台。已集成于：

- 收藏夹店铺卡片地址（`FavoritePlacesSection`）
- 活动外部链接卡片地址（`ExternalLinkCard`）

### 组件

```tsx
import { MapLauncher } from "@/components/common/MapLauncher";

<MapLauncher name={place.title} address={place.address} city={place.city}>
  <span>{place.address}</span>
</MapLauncher>
```

| Prop | 类型 | 说明 |
|------|------|------|
| `name` | `string \| null` | 店铺名，优先作为搜索关键词 |
| `address` | `string \| null` | 地址；名称地址均缺时不渲染菜单 |
| `city` | `string \| null` | 城市名，限定检索范围减少异地同名误匹配 |

### 平台兼容策略

双通道唤起：**原生 scheme / intent 直接唤起 App（第一优先级）**，Web URI API（https）作为兜底。

| 平台 | 唤起方式 | 未装 App |
|------|---------|---------|
| 安卓 | `intent://` URL（含 package + browser_fallback_url），浏览器直接唤起 | 浏览器自动打开 fallback 网页版，无报错弹窗 |
| 鸿蒙 2-4（Android 内核） | 同安卓 intent 路径 | 同上 |
| 鸿蒙 NEXT（OpenHarmony UA） | 网页版（uri.amap.com 页面自带「打开App」引导） | 网页版 |
| iOS | `iosamap://` / `baidumap://` scheme 直接唤起；页面失焦即成功 | 1.8s 超时后自动跳网页版 |
| 微信内置浏览器 | scheme 被微信屏蔽，直接打开网页版，并提示「用浏览器打开本页后可唤起App」 | 网页版 |
| 桌面 | 网页版 | — |

官方 scheme 协议（详见 `lib/map-links.ts`）：

| 提供商 | 平台 | scheme | 说明 |
|--------|------|--------|------|
| 高德 | Android | `androidamap://keywordNavi?sourceApplication=&keyword=` | 关键词搜索（官方 V5.0.0+） |
| 高德 | iOS | `iosamap://poi?sourceApplication=&name=` | POI 名称搜索（官方 V5.1.0+） |
| 百度 | 双端 | `baidumap://map/place/search?query=&region=&src=` | 地点检索 |

- iOS 失焦检测：scheme 唤起成功时页面触发 `visibilitychange`/`pagehide`，取消网页版兜底；超时仍可见则跳转兜底
- Apple 地图入口仅在苹果移动设备显示（`isApplePlatform()` UA + 触点检测，兼容 iPadOS 13+ 桌面 UA）
- 菜单另提供「复制名称与地址」兜底操作
- 触发器阻止事件冒泡，嵌在可点击卡片内不会误触卡片跳转

### 链接生成（`lib/map-links.ts`）

```ts
import { buildMapLinks, openMapApp } from "@/lib/map-links";

// Web URI 链接（兜底/桌面/微信用）
buildMapLinks({ name: "海底捞", address: "xx路1号", city: "上海" });
// {
//   amap:   "https://uri.amap.com/search?keyword=海底捞&city=上海&src=xiangke",
//   baidu:  "https://api.map.baidu.com/place/search?query=海底捞&region=上海&output=html&src=xiangke",
//   apple:  "https://maps.apple.com/?q=海底捞 xx路1号",
// }

// App 唤起编排（仅客户端）：自动检测平台 → scheme/intent/网页版
// 返回 "app" | "wechat" | "web"，"wechat" 时 UI 层提示用浏览器打开
openMapApp("amap", { name: "海底捞", address: "xx路1号", city: "上海" });
```

| 函数 | 说明 |
|------|------|
| `buildMapLinks(input)` | 生成三平台 Web URI 链接 |
| `detectMapPlatform(ua, touchPoints)` | 识别 ios / android / harmony / other |
| `buildAmapAndroidScheme` / `buildAmapIosScheme` / `buildBaiduScheme` | 构造官方原生 scheme |
| `toAndroidIntent(scheme, package, fallback)` | scheme 转 `intent://`（含未装降级） |
| `openMapApp(provider, input)` | 唤起编排：scheme 优先 + 微信/鸿蒙/桌面降级 |

纯前端功能，无需服务端 Key；未配置任何地图 Key 也可正常使用。

---

## 小程序认证（weapp 分支）

小程序端（Taro，`weapp/` 目录）与 Web 端共用同一套 Supabase 账号体系，通过 **Bearer token 双通道**接入：`getCurrentUser()` 检测 `Authorization: Bearer <access_token>` 头优先走 token 校验，否则回落 `sb-*` cookie 会话 —— 既有 50 余个业务 API 对小程序零改动可用。

```
小程序启动 → Taro.login() 拿 code
→ POST /api/auth/weapp/login { code }
    ├─ 服务端 code2Session 换 openid（需 WEAPP_APPID / WEAPP_SECRET）
    ├─ 虚拟邮箱 wx_{openid}@wechat.local + magic link 建立 Supabase 会话
    └─ 返回 { accessToken, refreshToken, expiresAt, isNewUser }
→ 小程序本地存储，后续请求携带 Bearer 头
→ access_token 过期（401）→ POST /api/auth/weapp/refresh 静默续期并重放
→ refresh 也失效 → 清除本地态引导重新登录
```

### POST /api/auth/weapp/login

| 项 | 说明 |
|----|------|
| 请求体 | `{ "code": "wx.login()获取的临时凭证" }` |
| 成功 | `200 { accessToken, refreshToken, expiresAt, isNewUser }` |
| 400 | code 缺失 / 请求体非 JSON |
| 401 | code 无效或已被使用（微信 40029 / 40163） |
| 501 | 服务端未配置 `WEAPP_APPID` / `WEAPP_SECRET`（`code: weapp_not_configured`） |
| 502 | 微信接口不可用 / Supabase 会话建立失败 |

首次登录自动注册：`profiles` 表入库，昵称默认 `微信用户{openid后4位}`；openid 写入 `user_metadata.weapp_openid`。

### POST /api/auth/weapp/refresh

| 项 | 说明 |
|----|------|
| 请求体 | `{ "refreshToken": "..." }` |
| 成功 | `200 { accessToken, refreshToken, expiresAt }` |
| 401 | refresh_token 已失效，小程序端应清除凭据重新登录 |

## 小程序内容安全（msgSecCheck）

小程序端发布动态 / 评论 / 创建圈子等 UGC 行为前，调用文本内容安全检测（微信官方 msgSecCheck 2.0），满足小程序审核要求。

### POST /api/weapp/security/msg-sec-check

需登录（Bearer 双通道）。openid 取自登录时写入的 `user_metadata.weapp_openid`，前端无需传。

```http
POST /api/weapp/security/msg-sec-check
Content-Type: application/json
```

```json
{
  "content": "要检测的文本（≤2500 字）",
  "scene": 4
}
```

| scene | 场景 |
|-------|------|
| 1 | 资料（圈子名称等） |
| 2 | 评论 |
| 3 | 论坛 |
| 4 | 社交日志（动态发布，默认） |

响应：

```json
{ "data": { "pass": true, "suggest": "pass", "label": 100 } }
```

| 字段 | 说明 |
|------|------|
| `pass` | 是否放行（前端只看这个） |
| `suggest` | 微信判定：`pass` / `review`（人审，放行）/ `risky`（拦截） |
| `label` | 100 正常；10001 广告、20002 色情、20003 辱骂、20006 违法犯罪、20008 欺诈、20012 低俗 等 |
| `reason` | `pass: false` 时的拦截提示文案 |
| `skipped` | 服务端未配置密钥或会话无 openid，跳过检测 |
| `fallback` | 微信接口故障，放行并记录日志（不阻塞业务） |

降级策略：本地开发未配置密钥直接放行；微信侧故障放行 + `console.error` 留痕；`review` 判定放行、`risky` 拦截。access_token 走 `stable_token` 接口（`lib/wechat.ts` 模块级缓存，提前 5 分钟刷新，40001 强制刷新重试一次）。

### 本地开发

1. `weapp/` 下 `cp .env.example .env`（指向本地 Next.js）
2. 微信开发者工具导入 `weapp/` 目录，appid 换成真实值，勾选「不校验合法域名」
3. 服务端 `.env` 配置 `WEAPP_APPID` / `WEAPP_SECRET`

---

## 小程序码（wxacode）

小程序分享海报底部的小程序码由服务端代理生成（微信官方 `getwxacodeunlimit`），扫码直达小程序页面。

### POST /api/weapp/wxacode

需登录（Bearer 双通道）。

```http
POST /api/weapp/wxacode
Content-Type: application/json
```

```json
{
  "scene": "e4f1c2a3b4d5e6f7a8b9c0d1e2f3a4b5",
  "page": "pages/detail/index",
  "width": 430
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `scene` | string | 必填，≤32 可见字符。活动 uuid 去横线恰好 32 字符 |
| `page` | string | 可选，默认 `pages/detail/index`，白名单校验 |
| `width` | number | 可选，280-1280，默认 430 |

响应：

```json
{ "data": { "base64": "<PNG base64>" } }
```

**scene 编解码约定**（`weapp/src/utils/api.ts`）：`activityIdToScene(uuid)` 去横线；详情页 `onLoad` 遇 `scene` 参数时用 `sceneToActivityId` 还原 8-4-4-4-12 格式。

错误：400 参数越界；502 微信侧失败（含 errcode/errmsg）；503 未配置密钥。生成失败时前端海报画占位框，不阻塞海报生成。

**前端缓存**：base64 结果缓存到 storage（key `wxacode:{id}`）+ 用户目录文件，避免重复生成。

### POI 坐标落库（地图导航）

`external_link` 新增可选字段 `location: { lng, lat }`（GCJ-02，与微信 `openLocation` / 高德同系）。链接解析 POI 兜底时由百度 BD-09 转换后写入（`lib/poi/coords.ts`）。小程序端点击地址行唤起 `wx.openLocation`；历史数据无坐标时降级复制地址文本。

---

## 错误码参考

| 平台 | 错误来源 | 常见原因 |
|------|---------|---------|
| 高德 | `infocode: 10001` | Key 无效或未开通 Web 服务 |
| 高德 | `infocode: 10021` | QPS 超限（个人开发者默认 3） |
| 高德 | `infocode: 10044` | 日配额用尽 |
| 百度 | `status: 2` | 参数错误（如 region 非法） |
| 百度 | `status: 200` | AK 无效或被禁用 |
| 百度 | `status: 302` | 并发/QPS 超限 |
| 百度 | `sn cal error` / `status: 1` 含 SN 字样 | SK 未配置或签名错误（确认 `BAIDU_MAP_SK` 与 AK 同步生成） |

单平台失败不影响另一平台；匹配错误不阻塞收藏入库主流程。

---

## 环境变量

```bash
# .env.local
AMAP_KEY=your-amap-web-service-key       # 高德 Web 服务 Key
BAIDU_MAP_AK=your-baidu-map-server-ak    # 百度地图服务端 AK
BAIDU_MAP_SK=your-baidu-map-server-sk    # 百度 SN 校验密钥（与 AK 配对使用）
```

- 高德申请：https://console.amap.com/ （选择「Web 服务」类型 Key）
- 百度申请：https://lbsyun.baidu.com/ （选择「服务端」类型 AK）
- **百度服务端 AK 默认强制 SN 校验**：创建应用时同步生成 SK，必须同时配置 `BAIDU_MAP_AK` 和 `BAIDU_MAP_SK`，否则百度会返回 `sn cal error` 拒绝请求
- 高德无需 SK，单 `AMAP_KEY` 即可
- 两个平台配置其一即可启用 POI 功能；均未配置时自动停用，收藏导入/链接解析主流程不受影响
- 坐标系：高德返回 GCJ-02，百度返回 BD-09；`candidate.location.coordType` 已标注

### 百度 SN 算法

百度 SN 签名计算（`calculateBaiduSn`）已内置，无需手动实现：

1. 提取请求 path（不含 host），如 `/place/v2/search`
2. 把所有参数（含 `ak`，不含 `sn`）按 key 字典序排序，拼接为 `k=v&k=v`（值不 URL 编码）
3. 拼接 `sk + path + "?" + sortedQuery`
4. 对上一步字符串做 `encodeURIComponent`（RFC3986）
5. 计算 MD5（小写 hex），作为 `sn` 参数附加到请求 URL

配了 `BAIDU_MAP_SK` 时自动计算并附加 SN；未配时按旧版 AK-only 发请求（向后兼容，但百度现版 AK 会被拒绝）。
