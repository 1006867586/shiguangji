# 想聚（飨刻）微信小程序 UI 对齐设计稿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Ardot 设计稿（715371942850999，6 屏 + 悬浮胶囊 Tab Bar）在 weapp 小程序上实现，保功能 + 真数据、只重样式，品牌名统一「飨刻」。

**Architecture:** Taro 4 + React 小程序，逐单元重写视觉层。设计令牌统一在 `src/styles/_tokens.scss`；自定义底栏沿用已就位的 `custom: true` + `tabStore` 机制，仅重写视觉为悬浮胶囊；各页面保留现有数据流与交互逻辑，只改 JSX 结构与 SCSS。

**Tech Stack:** Taro 4.0.9 / React 18 / SCSS（rpx，designWidth 750）/ canvas（转盘）/ 微信开发者工具

**设计规格：** `docs/superpowers/specs/2026-08-16-weapp-ui-alignment-design.md`（含每屏色值/结构/边界规则）

---

### Task 0: 设计令牌校准（`src/styles/_tokens.scss`）

**Files:**
- Modify: `weapp/src/styles/_tokens.scss`

- [ ] **Step 1: 校准令牌文件**

将 `weapp/src/styles/_tokens.scss` 完整替换为（主色/渐变终点补充 `$color-primary-mid`，其余值与设计稿一致）：

```scss
/**
 * 想聚 — 设计令牌（Design Tokens）
 * 从 Ardot 设计稿（715371942850999）提取，所有页面/组件统一引用。
 * rpx 单位基于 designWidth=750。
 */

// ---- 品牌色 ----
$color-primary: #ff6b35;        // 暖珊瑚 — 主品牌色
$color-primary-light: #ffa940;  // 暖橙 — 辅助/渐变终点
$color-primary-mid: #ff8c42;    // 中橙 — 渐变终点（设计稿 135° 渐变）
$color-primary-bg: #fff0e8;     // 珊瑚浅底 — 标签/按钮浅色背景
$color-primary-dark: #e55a2b;   // 深珊瑚 — 按压态

// ---- 微信绿（仅登录按钮）----
$color-wechat: #07c160;

// ---- 背景色 ----
$color-bg: #faf7f2;             // 暖米色 — 页面背景
$color-bg-card: #ffffff;        // 白色 — 卡片背景
$color-bg-muted: #f5f2ed;       // 暖灰 — 次级背景/未选中标签
$color-bg-hover: #f0ede8;       // 悬浮态

// ---- 文字色 ----
$color-text: #1a1a2e;           // 主文字
$color-text-secondary: #6b7280; // 次要文字
$color-text-muted: #9ca3af;     // 辅助/占位
$color-text-inverse: #ffffff;   // 反白文字

// ---- 功能色 ----
$color-star: #ff6b35;           // 评分星标
$color-error: #ef4444;          // 错误/删除
$color-success: #07c160;        // 成功
$color-warning: #f59e0b;        // 警告

// ---- 渐变 ----
$gradient-primary: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);

// ---- 圆角 ----
$radius-sm: 8rpx;
$radius-md: 16rpx;
$radius-lg: 24rpx;
$radius-xl: 32rpx;
$radius-pill: 999rpx;

// ---- 卡片阴影 ----
$shadow-card: 0 2rpx 12rpx rgba(0, 0, 0, 0.05);
$shadow-tabbar: 0 2rpx 12rpx rgba(0, 0, 0, 0.08);
$shadow-float: 0 4rpx 20rpx rgba(0, 0, 0, 0.12);

// ---- 间距 ----
$spacing-xs: 8rpx;
$spacing-sm: 12rpx;
$spacing-md: 16rpx;
$spacing-lg: 24rpx;
$spacing-xl: 32rpx;
$spacing-2xl: 48rpx;

// ---- 字号 ----
$font-xs: 20rpx;
$font-sm: 24rpx;
$font-base: 28rpx;
$font-md: 30rpx;
$font-lg: 32rpx;
$font-xl: 40rpx;
$font-2xl: 48rpx;

// ---- 边框 ----
$border-color: #f0ede8;
$border-color-light: #f5f2ed;
```

- [ ] **Step 2: 构建验证**

Run（在 `weapp/` 目录）: `npm run build:weapp`
Expected: `√ Webpack Compiled successfully`（仅 Sass @import 弃用警告）

- [ ] **Step 3: 提交**

```bash
git add weapp/src/styles/_tokens.scss
git commit -m "style(weapp): 校准设计令牌（补充渐变终点色，对齐设计稿）"
```

---

### Task 1: Tab Bar 悬浮胶囊（`src/custom-tab-bar/`）

**Files:**
- Modify: `weapp/src/custom-tab-bar/index.tsx`
- Modify: `weapp/src/custom-tab-bar/index.scss`
- Keep: `weapp/src/custom-tab-bar/tabStore.ts`（不改）

- [ ] **Step 1: 重写 `index.tsx` 为悬浮胶囊结构（保留 TABS/Icon/handleTap/tabStore 逻辑，容器类名改为胶囊）**

将 `index.tsx` 完整替换为：

```tsx
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getSelectedTab, subscribeTab } from "./tabStore";
import "./index.scss";

interface TabItem {
  key: string;
  pagePath: string;
  text: string;
  icon: "home" | "groups" | "plus" | "wheel" | "user";
  center?: boolean;
}

const TABS: TabItem[] = [
  { key: "index", pagePath: "/pages/index/index", text: "动态", icon: "home" },
  { key: "groups", pagePath: "/pages/groups/index", text: "圈子", icon: "groups" },
  { key: "publish", pagePath: "/pages/publish/index", text: "发布", icon: "plus", center: true },
  { key: "roulette", pagePath: "/pages/roulette/index", text: "转盘", icon: "wheel" },
  { key: "profile", pagePath: "/pages/profile/index", text: "我的", icon: "user" },
];

function Icon({ name, active }: { name: TabItem["icon"]; active: boolean }) {
  const color = active ? "#FF6B35" : "#9CA3AF";
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24">
          <path {...common} d="M3 11.5 12 4l9 7.5" />
          <path {...common} d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case "groups":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3" {...common} />
          <path {...common} d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path {...common} d="M16 6.2a3 3 0 0 1 0 5.6" />
          <path {...common} d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
        </svg>
      );
    case "plus":
      return (
        <svg width="28" height="28" viewBox="0 0 24 24">
          <path stroke="#fff" strokeWidth={2.4} strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
      );
    case "wheel":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" {...common} />
          <path {...common} d="M12 3v9l7.8 4.5" />
          <circle cx="12" cy="12" r="1.6" fill={color} />
        </svg>
      );
    case "user":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.4" {...common} />
          <path {...common} d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    default:
      return null;
  }
}

export default function CustomTabBar() {
  const [selected, setSelected] = useState<number>(getSelectedTab());

  useEffect(() => subscribeTab(setSelected), []);

  const handleTap = (t: TabItem, index: number) => {
    if (getSelectedTab() === index) return;
    Taro.switchTab({ url: t.pagePath });
  };

  return (
    <View className="custom-tab-bar">
      {TABS.map((t, i) => (
        <View
          key={t.key}
          className={`tab-item${t.center ? " tab-center" : ""}${selected === i ? " active" : ""}`}
          onClick={() => handleTap(t, i)}
        >
          <View className="tab-icon">
            <Icon name={t.icon} active={selected === i} />
          </View>
          <Text className="tab-label">{t.text}</Text>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 2: 重写 `index.scss` 为悬浮胶囊样式**

将 `index.scss` 完整替换为：

```scss
/* 自定义底栏：悬浮白色胶囊（设计稿 2:608），选中橙色实心圆 + 居中凸起发布键 */
.custom-tab-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 670rpx;
  height: 124rpx;
  margin: 0 auto;
  padding: 0 24rpx;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.96);
  border: 1rpx solid #f0ede8;
  border-radius: 72rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(20rpx);
  -webkit-backdrop-filter: blur(20rpx);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 124rpx;
  position: relative;
}

.tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  transition: transform 0.15s ease;
}

.tab-label {
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #9ca3af;
  line-height: 1;
  transition: color 0.15s ease;
}

/* 选中态：橙色实心圆 + 橙色标签 */
.tab-item.active .tab-icon {
  background: #ff6b35;
  box-shadow: 0 4rpx 12rpx rgba(255, 107, 53, 0.35);
  transform: translateY(-2rpx);
}

.tab-item.active .tab-label {
  color: #ff6b35;
  font-weight: 600;
}

/* 居中凸起发布键：渐变圆底 + 白色 + 号 */
.tab-center {
  flex: 0 0 120rpx;
}

.tab-center .tab-icon {
  position: absolute;
  top: -40rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff6b35 0%, #ffa940 100%);
  box-shadow: 0 8rpx 20rpx rgba(255, 107, 53, 0.4);
}

.tab-center.active .tab-icon {
  background: linear-gradient(135deg, #ff6b35 0%, #ffa940 100%);
  transform: translateX(-50%) scale(1.04);
  box-shadow: 0 8rpx 20rpx rgba(255, 107, 53, 0.4);
}

.tab-center .tab-label {
  margin-top: 64rpx;
}
```

- [ ] **Step 3: 构建验证**

Run（在 `weapp/` 目录）: `npm run build:weapp`
Expected: `√ Webpack Compiled successfully`

- [ ] **Step 4: 提交**

```bash
git add weapp/src/custom-tab-bar/index.tsx weapp/src/custom-tab-bar/index.scss
git commit -m "style(weapp): 自定义底栏改为悬浮白色胶囊（设计稿 2:608）"
```

---

### Task 2: 登录页（`src/pages/login/`）

**Files:**
- Modify: `weapp/src/pages/login/index.tsx`
- Modify: `weapp/src/pages/login/index.scss`

- [ ] **Step 1: 修改 `index.tsx`：品牌名「想聚」→「飨刻」，副标题对齐设计稿**

仅改动两处文案（其余逻辑/结构不动）：

```tsx
<Text className="brand-name">飨刻</Text>
<Text className="brand-slogan">聚餐不将就，点餐更轻松</Text>
```

- [ ] **Step 2: 重写 `index.scss`：对齐设计稿（渐变 `#FF6B36→#FF8C42`、居中品牌区、白色圆角按钮、协议文案）**

将 `index.scss` 完整替换为：

```scss
@import "../../styles/_tokens.scss";

.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 64rpx;
  box-sizing: border-box;
  background: linear-gradient(135deg, #ff6b36 0%, #ff8c42 100%);
  color: #ffffff;
}

.brand-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 20vh;
}

.logo {
  width: 168rpx;
  height: 168rpx;
  border-radius: 44rpx;
  background: rgba(255, 255, 255, 0.16);
  border: 2rpx solid rgba(255, 255, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 40rpx;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.12);
}

.logo-emoji {
  font-size: 88rpx;
}

.brand-name {
  font-size: 64rpx;
  font-weight: 700;
  letter-spacing: 8rpx;
  margin-bottom: 16rpx;
}

.brand-slogan {
  font-size: 28rpx;
  opacity: 0.92;
  letter-spacing: 2rpx;
}

.action-section {
  padding-bottom: calc(96rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hint {
  color: #fff3e8;
  font-size: 24rpx;
  margin-bottom: 20rpx;
  text-align: center;
}

.btn-wechat {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  background: #ffffff;
  color: #ff6b35;
  font-size: 32rpx;
  font-weight: 600;
  border: none;

  &::after {
    border: none;
  }
}

.privacy {
  margin-top: 28rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.privacy-link {
  color: #ffffff;
  text-decoration: underline;
}
```

- [ ] **Step 3: 构建验证**

Run: `npm run build:weapp` → Expected: `√ Compiled successfully`

- [ ] **Step 4: 提交**

```bash
git add weapp/src/pages/login/index.tsx weapp/src/pages/login/index.scss
git commit -m "style(weapp): 登录页对齐设计稿（品牌名飨刻、珊瑚渐变、白色登录按钮）"
```

---

### Task 3: 动态页（`src/pages/index/` + 组件卡片）

**Files:**
- Modify: `weapp/src/pages/index/index.scss`（筛选胶囊）
- Modify: `weapp/src/components/ActivityCard.scss`（卡片白底轻阴影圆角）
- Modify: `weapp/src/components/LinkCard.scss`（商家卡）
- Modify: `weapp/src/components/PhotoGrid.scss`（图集网格圆角）
- Keep: `weapp/src/pages/index/index.tsx` 逻辑不变（tsx 仅 class 名已就位）

- [ ] **Step 1: 重写 `pages/index/index.scss`：筛选胶囊 + 页面背景**

将 `index.scss` 完整替换为：

```scss
@import "../../styles/_tokens.scss";

.page {
  min-height: 100vh;
  background: $color-bg;
  padding-bottom: env(safe-area-inset-bottom);
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  padding-top: 30vh;

  .title {
    font-size: 40rpx;
    font-weight: 600;
    color: $color-text;
  }
}

.btn-primary {
  width: 60%;
  background: $color-primary;
  color: $color-text-inverse;
  border-radius: $radius-pill;
  border: none;

  &::after {
    border: none;
  }
}

.error {
  color: $color-error;
  display: block;
  margin: 12rpx 0;
}

// ---- 动态流 ----

.feed-page {
  .group-tabs {
    width: 100%;
    white-space: nowrap;
    background: transparent;
    padding: 24rpx 24rpx 8rpx;
    box-sizing: border-box;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .group-tab {
    display: inline-flex;
    padding: 14rpx 36rpx;
    margin-right: 16rpx;
    border-radius: $radius-pill;
    font-size: 26rpx;
    color: $color-text-secondary;
    background: $color-bg-card;
    border: 1rpx solid $border-color-light;
    transition: all 0.2s;

    &.active {
      color: $color-text-inverse;
      background: $color-primary;
      border-color: $color-primary;
      font-weight: 600;
    }
  }

  .feed-list {
    padding: 16rpx 24rpx 24rpx;
  }

  .feed-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12rpx;
    padding: 48rpx 0;
  }
}
```

- [ ] **Step 2: 重写 `components/ActivityCard.scss`：白卡片 + 轻阴影 + 圆角**

将 `ActivityCard.scss` 完整替换为（保持既有类名与布局，仅视觉对齐设计稿）：

```scss
@import "../styles/_tokens.scss";

.activity-card {
  margin-bottom: 24rpx;
  padding: 28rpx;
  background: $color-bg-card;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
  border: 1rpx solid $border-color-light;

  .card-header {
    display: flex;
    align-items: center;
    margin-bottom: 16rpx;

    .avatar {
      width: 72rpx;
      height: 72rpx;
      border-radius: 50%;
      margin-right: 16rpx;
      background: $color-bg-muted;
    }

    .header-main {
      flex: 1;

      .nickname {
        display: block;
        font-size: 28rpx;
        font-weight: 600;
        color: $color-text;
      }

      .time {
        font-size: 22rpx;
        color: $color-text-muted;
        margin-top: 4rpx;
      }
    }

    .repost-badge {
      font-size: 20rpx;
      color: $color-primary;
      background: $color-primary-bg;
      padding: 4rpx 12rpx;
      border-radius: $radius-pill;
    }
  }

  .repost-comment {
    display: block;
    font-size: 26rpx;
    color: $color-text-secondary;
    margin-bottom: 12rpx;
  }

  .content {
    display: block;
    font-size: 30rpx;
    line-height: 1.6;
    color: $color-text;
    margin-bottom: 16rpx;
    white-space: pre-wrap;
  }

  .repost-quote {
    margin-top: 16rpx;
    padding: 20rpx;
    background: $color-bg-muted;
    border-radius: $radius-md;

    .quote-author {
      display: block;
      font-size: 24rpx;
      color: $color-primary;
      margin-bottom: 8rpx;
    }

    .quote-content {
      font-size: 26rpx;
      color: $color-text-secondary;
      line-height: 1.5;
    }
  }

  .card-actions {
    display: flex;
    align-items: center;
    margin-top: 20rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid $border-color-light;

    .action-btn {
      display: flex;
      align-items: center;
      gap: 8rpx;
      margin-right: 40rpx;

      .action-icon {
        font-size: 30rpx;
        color: $color-text-secondary;

        &.liked {
          color: $color-primary;
        }
      }

      .action-count {
        font-size: 24rpx;
        color: $color-text-muted;
      }

      &.share-btn {
        margin-left: auto;
        background: transparent;
        border: none;
        padding: 0;
        line-height: 1;

        &::after {
          border: none;
        }
      }
    }
  }
}
```

- [ ] **Step 3: 重写 `components/LinkCard.scss`（商家卡：店名/评分/人均/地址/电话）**

将 `LinkCard.scss` 完整替换为：

```scss
@import "../styles/_tokens.scss";

.link-card {
  display: flex;
  flex-direction: column;
  margin-top: 16rpx;
  padding: 24rpx;
  background: $color-bg-muted;
  border-radius: $radius-md;

  .link-body {
    .link-title {
      display: block;
      font-size: 30rpx;
      font-weight: 600;
      color: $color-text;
      margin-bottom: 8rpx;
    }

    .link-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12rpx;
      margin-bottom: 12rpx;

      .link-rating {
        font-size: 24rpx;
        color: $color-star;
        font-weight: 600;
      }

      .link-tag {
        font-size: 20rpx;
        color: $color-primary;
        background: $color-primary-bg;
        padding: 4rpx 12rpx;
        border-radius: $radius-pill;
      }

      .link-price {
        font-size: 24rpx;
        color: $color-text-secondary;
      }
    }

    .link-row {
      display: flex;
      align-items: center;
      margin-top: 8rpx;

      .link-row-label {
        font-size: 22rpx;
        color: $color-text-muted;
        margin-right: 12rpx;
        flex-shrink: 0;
      }

      .link-row-value {
        font-size: 24rpx;
        color: $color-text-secondary;
        flex: 1;
      }

      .link-row-icon {
        font-size: 24rpx;
        margin-left: 8rpx;
      }
    }
  }

  .link-cover {
    width: 100%;
    height: 240rpx;
    border-radius: $radius-md;
    margin-top: 16rpx;
    background: $color-bg-hover;
  }

  .link-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $border-color;

    .link-platform {
      font-size: 22rpx;
      color: $color-primary;
    }

    .link-copy-hint {
      font-size: 20rpx;
      color: $color-text-muted;
    }
  }
}
```

- [ ] **Step 4: 重写 `components/PhotoGrid.scss`（九宫格圆角）**

将 `PhotoGrid.scss` 完整替换为（保留既有类名结构）：

```scss
@import "../styles/_tokens.scss";

.photo-grid {
  display: grid;
  gap: 8rpx;
  margin-bottom: 16rpx;

  &.single {
    .photo-single {
      width: 100%;
      height: 420rpx;
      border-radius: $radius-lg;
      background: $color-bg-muted;
    }
  }

  &.grid-2,
  &.grid-3 {
    grid-template-columns: repeat(3, 1fr);

    .photo-cell {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      border-radius: $radius-md;
      overflow: hidden;
      background: $color-bg-muted;

      .photo-img {
        width: 100%;
        height: 100%;
      }
    }
  }
}
```

- [ ] **Step 5: 构建验证**

Run: `npm run build:weapp` → Expected: `√ Compiled successfully`

- [ ] **Step 6: 提交**

```bash
git add weapp/src/pages/index/index.scss weapp/src/components/ActivityCard.scss weapp/src/components/LinkCard.scss weapp/src/components/PhotoGrid.scss
git commit -m "style(weapp): 动态页对齐设计稿（筛选胶囊、卡片白底轻阴影、商家卡评分人均）"
```

---

### Task 4: 圈子页（`src/pages/groups/`）

**Files:**
- Modify: `weapp/src/pages/groups/index.scss`
- Keep: `weapp/src/pages/groups/index.tsx`（已符合产品规则：仅已加入圈子 + 邀请码/创建入口；逻辑不动）

- [ ] **Step 1: 重写 `index.scss`：标题栏 + 群组卡片（头像/名称/邀请码/简介/进入）**

将 `index.scss` 完整替换为（保留既有类名 `top-bar/page-title/top-actions/action-btn/circle-list/circle-card/...`）：

```scss
@import "../../styles/_tokens.scss";

.groups-page {
  min-height: 100vh;
  background: $color-bg;
  padding: 24rpx;
  box-sizing: border-box;

  &.placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 30vh;

    .btn-login {
      width: 60%;
      margin-top: 24rpx;
      background: $color-primary;
      color: $color-text-inverse;
      border-radius: $radius-pill;
      border: none;

      &::after {
        border: none;
      }
    }
  }
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 8rpx 24rpx;

  .page-title {
    font-size: 44rpx;
    font-weight: 700;
    color: $color-text;
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 16rpx;

    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 64rpx;
      padding: 0 24rpx;
      border-radius: $radius-pill;
      font-size: 26rpx;

      &.join-btn {
        background: $color-bg-card;
        color: $color-primary;
        border: 1rpx solid $border-color;
      }

      &.create-btn {
        width: 64rpx;
        padding: 0;
        background: $color-primary;
        color: #ffffff;

        .create-icon {
          font-size: 36rpx;
          line-height: 1;
        }
      }
    }
  }
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 96rpx 0;

  .state-emoji {
    font-size: 72rpx;
  }
}

.circle-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.circle-card {
  background: $color-bg-card;
  border-radius: $radius-lg;
  padding: 28rpx;
  box-shadow: $shadow-card;
  border: 1rpx solid $border-color-light;

  .card-head {
    display: flex;
    align-items: center;

    .circle-icon {
      width: 88rpx;
      height: 88rpx;
      border-radius: 24rpx;
      margin-right: 20rpx;
      background: $color-bg-muted;

      &.gradient-icon {
        background: $gradient-primary;
        display: flex;
        align-items: center;
        justify-content: center;

        .icon-text {
          color: #ffffff;
          font-size: 40rpx;
          font-weight: 600;
        }
      }
    }

    .circle-info {
      flex: 1;

      .circle-name-row {
        display: flex;
        align-items: center;
        gap: 12rpx;

        .circle-name {
          font-size: 32rpx;
          font-weight: 600;
          color: $color-text;
        }

        .role-badge {
          font-size: 20rpx;
          color: $color-primary;
          background: $color-primary-bg;
          padding: 4rpx 12rpx;
          border-radius: $radius-pill;
        }
      }

      .circle-members {
        display: block;
        font-size: 24rpx;
        color: $color-text-muted;
        margin-top: 8rpx;
      }
    }
  }

  .circle-desc {
    display: block;
    font-size: 26rpx;
    color: $color-text-secondary;
    margin-top: 20rpx;
    line-height: 1.5;
  }

  .circle-enter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 20rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid $border-color-light;

    .enter-text {
      font-size: 26rpx;
      color: $color-primary;
      font-weight: 500;
    }

    .enter-arrow {
      font-size: 32rpx;
      color: $color-text-muted;
    }
  }
}

.loading-mask {
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
```

- [ ] **Step 2: 构建验证**

Run: `npm run build:weapp` → Expected: `√ Compiled successfully`

- [ ] **Step 3: 提交**

```bash
git add weapp/src/pages/groups/index.scss
git commit -m "style(weapp): 圈子页对齐设计稿（仅已加入圈子、卡片化、邀请码/创建入口）"
```

---

### Task 5: 发布页（`src/pages/publish/`）

**Files:**
- Modify: `weapp/src/pages/publish/index.tsx`（加「取消/发布」顶栏；Textarea 占位文案改设计稿文案）
- Modify: `weapp/src/pages/publish/index.scss`

**现状**：页面根节点已是 `publish-page has-tabbar`，结构为「发布到 form-card + Textarea + 图片宫格 + 链接解析 + 提交按钮」，**无顶栏**；所有逻辑（选圈/图片/链接/发布）保持不动。

- [ ] **Step 1: 在 `index.tsx` 渲染顶部加「取消/发布」顶栏**

在 `<View className="publish-page has-tabbar">` 之后、第一个 `form-card` 之前插入（发布按钮复用现有提交函数 `submit`，位于 `index.tsx:145`）：

```tsx
<View className="publish-topbar">
  <Text className="topbar-cancel" onClick={() => Taro.switchTab({ url: "/pages/index/index" })}>取消</Text>
  <Text className="topbar-title">发布</Text>
  <View className="topbar-submit" onClick={() => void submit()}>发布</View>
</View>
```

- [ ] **Step 2: Textarea 占位文案改设计稿文案**

```tsx
placeholder="分享你的聚餐故事…"
```

- [ ] **Step 3: 重写 `index.scss` 顶部为设计稿样式（保留既有表单类名）**

将 `index.scss` 顶部补充（其余既有样式保留，卡片统一白底圆角阴影）：

```scss
@import "../../styles/_tokens.scss";

.publish-page {
  min-height: 100vh;
  background: $color-bg;
  padding: 24rpx;
  box-sizing: border-box;
}

.publish-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 8rpx 24rpx;

  .topbar-cancel {
    font-size: 30rpx;
    color: $color-text-secondary;
  }

  .topbar-title {
    font-size: 34rpx;
    font-weight: 600;
    color: $color-text;
  }

  .topbar-submit {
    padding: 12rpx 36rpx;
    border-radius: $radius-pill;
    background: $color-primary;
    color: #ffffff;
    font-size: 28rpx;
    font-weight: 500;
  }
}
```

（若现有 `index.scss` 无 `@import "../../styles/_tokens.scss";` 则补上；表单卡片已用 `$color-bg-card/$radius-lg/$shadow-card` 的保持，未用的对齐到这些令牌。）

- [ ] **Step 4: 构建验证**

Run: `npm run build:weapp` → Expected: `√ Compiled successfully`

- [ ] **Step 5: 提交**

```bash
git add weapp/src/pages/publish/index.tsx weapp/src/pages/publish/index.scss
git commit -m "style(weapp): 发布页对齐设计稿（取消/发布顶栏、占位文案、表单卡片）"
```

---

### Task 6: 我的页（`src/pages/profile/`）

**Files:**
- Modify: `weapp/src/pages/profile/index.tsx`（品牌文案「想聚」→「飨刻」；统计行保留圈子/通知/收藏，图标化）
- Modify: `weapp/src/pages/profile/index.scss`

- [ ] **Step 1: 修改 `index.tsx`：未登录占位文案品牌名改为飨刻**

```tsx
<Text className="placeholder-title">欢迎使用「飨刻」</Text>
```

- [ ] **Step 2: 重写 `index.scss`：渐变 Hero + 统计 + 菜单卡片对齐设计稿**

将 `index.scss` 完整替换为（保留既有类名 `hero/hero-avatar/hero-name/hero-stats/stat-item/menu-section/menu-card/menu-item/...`）：

```scss
@import "../../styles/_tokens.scss";

.profile-page {
  min-height: 100vh;
  background: $color-bg;

  &.placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 30vh;
    gap: 24rpx;

    .btn-login {
      width: 60%;
      margin-top: 24rpx;
      background: $color-primary;
      color: $color-text-inverse;
      border-radius: $radius-pill;
      border: none;

      &::after {
        border: none;
      }
    }
  }
}

.hero {
  background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
  padding: 64rpx 48rpx 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  border-radius: 0 0 48rpx 48rpx;

  .hero-avatar {
    width: 144rpx;
    height: 144rpx;
    border-radius: 50%;
    overflow: hidden;
    border: 4rpx solid rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.25);
  }

  .hero-name {
    font-size: 36rpx;
    font-weight: 600;
    color: #ffffff;
  }

  .hero-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-top: 16rpx;

    .stat-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4rpx;

      .stat-num {
        font-size: 40rpx;
        font-weight: 700;
        color: #ffffff;
      }

      .stat-label {
        font-size: 24rpx;
        color: rgba(255, 255, 255, 0.85);
      }
    }

    .stat-divider {
      width: 1rpx;
      height: 48rpx;
      background: rgba(255, 255, 255, 0.3);
    }
  }
}

.menu-section {
  padding: 32rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.menu-card {
  background: $color-bg-card;
  border-radius: $radius-lg;
  box-shadow: $shadow-card;
  border: 1rpx solid $border-color-light;
  overflow: hidden;

  .menu-item {
    display: flex;
    align-items: center;
    padding: 28rpx 32rpx;
    border-bottom: 1rpx solid $border-color-light;

    &:last-child {
      border-bottom: none;
    }

    &.logout {
      .menu-label {
        color: $color-error;
      }
    }

    .menu-icon {
      font-size: 36rpx;
      margin-right: 20rpx;
    }

    .menu-label {
      flex: 1;
      font-size: 30rpx;
      color: $color-text;
    }

    .menu-badge {
      font-size: 22rpx;
      color: #ffffff;
      background: $color-primary;
      border-radius: $radius-pill;
      padding: 4rpx 16rpx;
      margin-right: 12rpx;
    }

    .menu-arrow {
      font-size: 32rpx;
      color: $color-text-muted;
    }
  }
}
```

- [ ] **Step 3: 构建验证**

Run: `npm run build:weapp` → Expected: `√ Compiled successfully`

- [ ] **Step 4: 提交**

```bash
git add weapp/src/pages/profile/index.tsx weapp/src/pages/profile/index.scss
git commit -m "style(weapp): 我的页对齐设计稿（渐变 Hero、统计行、菜单卡片）"
```

---

### Task 7: 转盘页（`src/pages/roulette/`）

**Files:**
- Modify: `weapp/src/pages/roulette/index.tsx`（仅 `SLICE_COLORS` 改设计稿 6 色）
- Modify: `weapp/src/pages/roulette/index.scss`（微调：确认背景/标题/指针/GO/最近结果与设计稿一致；缺则补）

**现状（已基本符合设计稿）**：标题区「今天吃啥？/转一转，告别选择困难」、顶部三角指针、中心 GO 圆钮（白底橙描边）、中奖卡片、最近结果 chips（`history` 状态）、候选池管理均已存在且用珊瑚令牌。

- [ ] **Step 1: `SLICE_COLORS` 改为设计稿 6 色**

将 `index.tsx` 中的：

```tsx
const SLICE_COLORS = [
  "#FF6B35", // 暖珊瑚
  "#FFA940", // 暖橙
  "#FF8C42", // 中橙
  "#FF6B6B", // 珊瑚红
  "#4ECDC4", // 薄荷青
  "#6C5CE7", // 紫罗兰
  "#FFA940",
  "#FF6B35",
  "#FF8C42",
  "#FF6B6B",
  "#4ECDC4",
  "#6C5CE7",
];
```

替换为设计稿 6 色（与 DEFAULT_CUISINES 顺序 火锅/日料/烧烤/川菜/粤菜/西餐 对应）：

```tsx
/** 设计稿 6 色：火锅/日料/烧烤/川菜/粤菜/西餐 */
const SLICE_COLORS = [
  "#FF6B3D", // 火锅 橙红
  "#FFA040", // 日料 橙
  "#FF8C42", // 烧烤 橙
  "#F25C7A", // 川菜 粉
  "#3DC2B8", // 粤菜 青
  "#4A4AE8", // 西餐 紫
];
```

- [ ] **Step 2: 核对 `index.scss` 与设计稿一致（背景暖米、标题居中、指针黑色、GO 白底橙描边、最近结果首项高亮）**

现有 `roulette/index.scss` 已满足：背景 `$color-bg`、标题居中、指针黑色三角、GO 白底橙边、`history-tag.latest` 高亮。**若已一致则跳过本步**；不一致处以设计稿为准微调（见计划附录 A 的色值）。

- [ ] **Step 3: 构建验证**

Run: `npm run build:weapp` → Expected: `√ Compiled successfully`

- [ ] **Step 4: 提交**

```bash
git add weapp/src/pages/roulette/index.tsx
git commit -m "style(weapp): 转盘页对齐设计稿（6 色分段）"
```

---

### Task 8: 全量验证与收尾

- [ ] **Step 1: 全量构建**

Run: `npm run build:weapp` → Expected: `√ Compiled successfully`，`weapp/dist/` 产物更新

- [ ] **Step 2: 检查产物包含设计稿关键色**

在 `weapp/dist/` 下检索：

```powershell
Get-ChildItem 'D:\ai project\shiguangji\weapp\dist' -Recurse -Include *.wxss | ForEach-Object { $raw = [System.IO.File]::ReadAllText($_.FullName); $c = ([regex]::Matches($raw, 'ff6b35')).Count; if ($c -gt 0) { Write-Host "$($_.Name): coral=$c" } }
```

Expected: roulette/groups/login/profile/publish/index 的 wxss 均含 `ff6b35`

- [ ] **Step 3: 检查产物无 `process.` 残留**

```powershell
Get-ChildItem 'D:\ai project\shiguangji\weapp\dist' -Recurse -Include *.js | Select-String -Pattern 'process' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count
```

Expected: `0`

- [ ] **Step 4: 开发者工具验证**

在微信开发者工具打开 `weapp/`（miniprogramRoot=dist/），逐 tab 检查 6 屏与悬浮胶囊底栏；必要时截图用 modlens 与设计稿对比（`C:\Users\Administrator\.dsh\ardot-shots\*.png` 为设计稿参考）。

- [ ] **Step 5: 状态确认**

```bash
git status --short
git log --oneline -12
```

Expected: 仅剩 `?? weapp/project.private.config.json`（开发者工具私有配置，不提交）

- [ ] **Step 6: 汇报**

汇总各阶段提交（Task 0–7 共 8 个 style 提交 + checkpoint/文档提交），说明待用户确认项：真机预览、上架前 appid/域名配置（AGENTS.md 约定）。

---

## 附录 A：设计稿参考色值（modlens 读取确认）

| 用途 | 色值 |
|------|------|
| 珊瑚主色（选中/CTA/点赞） | `#FF6B35` |
| 亮橙（渐变终点/辅助） | `#FFA940` |
| 中橙（渐变终点/登录底） | `#FF8C42` |
| 登录页渐变 | `#FF6B36 → #FF8C42`（135°） |
| 页面暖米背景 | `#FAF7F2` / 转盘页 `#FFF8F0` |
| 转盘分段 | 火锅 `#FF6B3D`、日料 `#FFA040`、烧烤 `#FF8C42`、川菜 `#F25C7A`、粤菜 `#3DC2B8`、西餐 `#4A4AE8` |
| 转盘中心 GO | 白底 + 橙色描边圆 |
| 顶部指针 | 黑色实心三角 |
| Tab Bar 胶囊 | 白底、1rpx 边框 `#F0EDE8`、圆角 72rpx、阴影 `0 2rpx 12rpx rgba(0,0,0,.08)` |
| 未选中图标/文字 | `#9CA3AF` |
| 商家卡信息 | 评分星标 `#FF6B35`、人均/距离次要文字 `#6B7280` |

## 附录 B：关键验证命令

```powershell
# 构建（weapp 目录）
npm run build:weapp

# 产物珊瑚色检查
Get-ChildItem 'D:\ai project\shiguangji\weapp\dist' -Recurse -Include *.wxss | ForEach-Object { $raw = [System.IO.File]::ReadAllText($_.FullName); $c = ([regex]::Matches($raw, 'ff6b35')).Count; if ($c -gt 0) { Write-Host "$($_.Name): coral=$c" } }

# 产物无 process 残留
Get-ChildItem 'D:\ai project\shiguangji\weapp\dist' -Recurse -Include *.js | Select-String -Pattern 'process' -SimpleMatch | Measure-Object | Select-Object -ExpandProperty Count
```

## 附录 C：设计稿参考截图（modlens 可复核）

`C:\Users\Administrator\.dsh\ardot-shots\{login,feed,tabbar,publish,profile,circle,roulette}.png`
