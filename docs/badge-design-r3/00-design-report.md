# 飨刻 Web 端徽章视觉设计报告（R3 · v3 复古贴纸版）

> **版本**：R3 v3（复古收藏卡贴纸）
> **变更**：v1（极简线稿）→ v2（仙侠插画）→ **v3（复古 1960s 贴纸）**。本版基于业务反馈"风格不对，太仙 / 太写实"重新定位。
>
> **范围**：仅 web 端装饰商城 / 装扮面板。**不**修改 `weapp/`，最终代码与图片资源走 `main` 分支（AGENTS.md）。

---

## 1. 演进路径

| 版本 | 方向 | 业务反馈 | 结论 |
|---|---|---|---|
| v1 | 极简线稿 + 霓虹光晕 | "太简约" | 保留为技术参考，但视觉太素 |
| v2 | 仙侠古风插画 + 体积光 | "风格不对，太仙 / 太写实" | **废弃**，归档到 `_archive-v2-illustration/` |
| **v3** | **复古 1960s 贴纸 + 撕纸边** | （待定）| **当前方向**，已产出 33 张候选 |

---

## 2. 设计目标（v3）

1. **复古贴纸风格**：参考 1960s 美式棒球卡 / 50s 餐厅菜单 / 70s 旅行海报
2. **撕纸边作为天然边框**：完全替代圆环光晕（与上一版双轨制方案不同）
3. **插画徽章完全独立渲染**：不再与 `.badge-glow` 圆环叠合，插画本身足够丰富
4. **明亮饱和糖果色**：去古风、去写实、去深沉
5. **无任何文字**：生图模型易拼错文字，统一由前端代码后期贴中文

---

## 3. 视觉语言（v3）

**关键词**：复古贴纸 · 撕纸边 · 扁平卡通 · 厚黑描边 · 半色调网点 · 明亮饱和

### 3.1 调性稿（已生成 · 4 张）

位于 `retrosample/` 子目录：

| 文件 | 主体 | 调性 |
|---|---|---|
| `retrosample/retro-hotpot_001.jpg` | 翻滚火锅 | 1960s 棒球卡风 |
| `retrosample/retro-tea_001.jpg` | 茶盏 + 落梅 | 50s 餐厅菜单风 |
| `retrosample/retro-mountain_001.jpg` | 远山 + 松林 | 70s 旅行海报风 |
| `retrosample/retro-noodle_001.jpg` | 筷子挑面 | 50s 美式餐厅风 |

### 3.2 三件套：插画主体、撕纸边、网点纹理

```
   ╱─────────────────────╲     <- 撕纸边（不规则边缘）
  │                       │
  │   ┌───────────────┐   │
  │   │   插画主体     │   │   <- 厚黑描边 + 扁平卡通
  │   │  (单焦点)     │   │
  │   └───────────────┘   │
  │      · · · · · ·       │   <- 半色调网点（halftone dot）
  │   背景：奶油色 #f5ecd9 │
   ╲─────────────────────╱
```

**核心约束**：
- **单焦点**：每枚徽章只有 1 个主图形 + 1~2 辅元素
- **撕纸边**：不规则毛边（像真贴纸从纸上撕下来）
- **背景统一**：所有徽章都用奶油色 `#f5ecd9`，不加场景、不加体积光
- **半色调网点**：主体附近加点状纹理增强复古感
- **配色**：每个 key 配 1 个主色（沿用现有 11 枚 hex）+ 2~3 个辅色
- **绝不加文字**：生图模型会拼错文字，统一前端后处理

### 3.3 三档稀有度

| 稀有度 | 视觉差异 |
|---|---|
| 普通 (common) | 撕纸边 + 厚描边 + 半色调网点 |
| 稀有 (rare) | 撕纸边 + 厚描边 + 半色调网点 + **金色描边**（在厚黑描边外加一圈金线） |
| 史诗 (epic) | 撕纸边 + 厚描边 + 半色调网点 + 金色描边 + **背景渐变 / 多色**（奶油色背景换成主题色淡色背景） |

---

## 4. 11 枚现有徽章复古重制（已生成 33 张候选）

每枚徽章生成 3 张候选，方便挑一张。位于 `proposal/11_*.jpg`：

| key | 名称 | 主色 | 候选数 | 文件 |
|---|---|---|---|---|
| `badge_hotpot` | 火锅信徒 | `#ef4444` | 3 | `11_badge_hotpot_{001..003}.jpg` |
| `badge_meals_week_10` | 本周吃了 10 顿 | `#ef4444` | 3 | `11_badge_meals_week_10_{001..003}.jpg` |
| `badge_meals_week_5` | 本周吃了 5 顿 | `#f59e0b` | 3 | `11_badge_meals_week_5_{001..003}.jpg` |
| `badge_total_meals_20` | 美食家 | `#f59e0b` | 3 | `11_badge_total_meals_20_{001..003}.jpg` |
| `badge_streak_3` | 连续打卡 3 天 | `#8b5cf6` | 3 | `11_badge_streak_3_{001..003}.jpg` |
| `badge_streak_7` | 一周不缺席 | `#38bdf8` | 3 | `11_badge_streak_7_{001..003}.jpg` |
| `badge_circles_3` | 社交达人 | `#10b981` | 3 | `11_badge_circles_3_{001..003}.jpg` |
| `badge_activities_1` | 发起人 | `#ec4899` | 3 | `11_badge_activities_1_{001..003}.jpg` |
| `badge_star` | 闪耀之星 | `#fde047` | 3 | `11_badge_star_{001..003}.jpg` |
| `badge_cup` | 干饭冠军 | `#f59e0b` | 3 | `11_badge_cup_{001..003}.jpg` |
| `badge_crown` | 饕餮之王 | `#a16207` | 3 | `11_badge_crown_{001..003}.jpg` |

> **注意事项**：生图模型偶尔会拼错文字（`NI VOLD FFB79.00` 等伪文字），前端代码层会**完全遮罩或裁掉底部 15%**，避免显示。

---

## 5. 生图 Prompt 模板（v3 · 稳定）

### 5.1 单枚复古贴纸徽章（标准模板）

```
A retro vintage collectible sticker badge in the style of 1960s
baseball cards: <主体描述>, illustrated in bold flat colors
(<主色 hex>, <辅色 1>, <辅色 2>, <辅色 3>), thick black outline,
halftone dot pattern texture overlay, slightly torn paper edges,
aged cream paper background #f5ecd9, NO TEXT, NO typography,
NO realistic textures, NO cinematic lighting, NO god rays,
NO dark background, flat illustration only, sticker aesthetic, 1:1
```

### 5.2 批量出图脚本

```bash
mmx image generate \
  --prompt "A retro vintage collectible sticker badge in the style of 1960s baseball cards: a stylized king crown with gems and points, illustrated in bold flat colors (deep amber #a16207, cream, dark teal, ruby red), thick black outline, halftone dot pattern texture overlay, slightly torn paper edges, aged cream paper background #f5ecd9, NO TEXT, NO typography, NO realistic textures, NO cinematic lighting, NO god rays, NO dark background, flat illustration only, sticker aesthetic, 1:1" \
  --aspect-ratio 1:1 --n 3 \
  --out-dir docs/badge-design-r3/proposal \
  --out-prefix 11_badge_crown
```

---

## 6. 工程落地（关键决策）

### 6.1 渲染链路（重大变更）

**v2 的方案**（已废弃）：
- 20px 走内联 SVG（保留锐利度）
- 40px+ 走 PNG / WebP 图片

**v3 的新方案**：
- **所有尺寸都走 PNG / WebP 图片**（撕纸边无法用 SVG 表达）
- 20px 昵称侧栏：128px 资源，CSS `image-rendering: -webkit-optimize-contrast`
- 40–64px 装扮面板：256px 资源
- 128px+ 弹层 / 启动屏：512px 资源

### 6.2 资源组织

```
public/
  badges/
    v3/
      common/
        badge_hotpot.webp        # 256×256
        badge_hotpot@2x.webp     # 512×512
        ...
      rare/
        ...
      epic/
        ...
```

### 6.3 前端组件改造

`components/decor/BadgeGlow.tsx` 改造：
- 去掉 `.badge-glow` 圆环容器
- 改为 `<img>` 直接展示贴纸
- 保留 `color` prop 兜底（图片加载失败时显示圆形色块）

### 6.4 待批候选

用户需要在每枚徽章的 3 张候选里挑 1 张。挑完后进入资源裁剪 + WebP 转码流水线。

---

## 7. 验收清单

- [x] v1 / v2 已归档到 `_archive-*/`
- [x] v3 4 张调性稿已生成（`retrosample/`）
- [x] v3 11 枚现有徽章 × 3 候选 = 33 张候选已生成（`proposal/`）
- [x] 风格统一：复古贴纸 + 撕纸边 + 扁平 + 厚描边 + 半色调
- [x] 无古风 / 无写实 / 无体积光 / 无暗底
- [x] 不动 `weapp/`、不污染 `main`、不写代码
- [ ] **待用户挑选 11 枚的最终候选**

---

## 8. 文件清单

```
docs/badge-design-r3/
├── 00-design-report.md                  # 本文件
├── retrosample/                         # 4 张风格调性稿
│   ├── retro-hotpot_001.jpg
│   ├── retro-tea_001.jpg
│   ├── retro-mountain_001.jpg
│   └── retro-noodle_001.jpg
├── proposal/                            # 11 枚 × 3 候选 = 33 张
│   ├── 11_badge_hotpot_001..003.jpg
│   ├── 11_badge_meals_week_10_001..003.jpg
│   ├── 11_badge_meals_week_5_001..003.jpg
│   ├── 11_badge_total_meals_20_001..003.jpg
│   ├── 11_badge_streak_3_001..003.jpg
│   ├── 11_badge_streak_7_001..003.jpg
│   ├── 11_badge_circles_3_001..003.jpg
│   ├── 11_badge_activities_1_001..003.jpg
│   ├── 11_badge_star_001..003.jpg
│   ├── 11_badge_cup_001..003.jpg
│   └── 11_badge_crown_001..003.jpg
├── _archive-v1-lineart/                 # 归档：v1 极简线稿
│   └── moodline-*.jpg (3 张)
└── _archive-v2-illustration/            # 归档：v2 仙侠插画
    ├── hero-*.jpg (4 张)
    └── scale-test_001.jpg (1 张)
```
