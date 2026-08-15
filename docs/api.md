# POI 匹配 API 文档

通过高德/百度地图官方 POI 检索接口，对美团/点评等平台解析出的店铺名进行多级降级匹配，补齐电话、地址、品类、评分等信息。

## 目录

- [主流程集成](#主流程集成)
- [POST /api/favorite-places](#post-apifavorite-places)
- [POST /api/places/match-poi](#post-apiplacesmatch-poi)
- [POST /api/link-preview](#post-apilink-preview)
- [匹配算法说明](#匹配算法说明)
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

## 错误码参考

| 平台 | 错误来源 | 常见原因 |
|------|---------|---------|
| 高德 | `infocode: 10001` | Key 无效或未开通 Web 服务 |
| 高德 | `infocode: 10021` | QPS 超限（个人开发者默认 3） |
| 高德 | `infocode: 10044` | 日配额用尽 |
| 百度 | `status: 2` | 参数错误（如 region 非法） |
| 百度 | `status: 200` | AK 无效或被禁用 |
| 百度 | `status: 302` | 并发/QPS 超限 |

单平台失败不影响另一平台；匹配错误不阻塞收藏入库主流程。

---

## 环境变量

```bash
# .env.local
AMAP_KEY=your-amap-web-service-key       # 高德 Web 服务 Key
BAIDU_MAP_AK=your-baidu-map-server-ak    # 百度地图服务端 AK
```

- 高德申请：https://console.amap.com/ （选择「Web 服务」类型 Key）
- 百度申请：https://lbsyun.baidu.com/ （选择「服务端」类型 AK）
- 两者配置其一即可启用；均未配置时 POI 功能自动停用，收藏导入不受影响
- 坐标系：高德返回 GCJ-02，百度返回 BD-09；`candidate.location.coordType` 已标注
