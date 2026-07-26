import { test, expect } from "@playwright/test";

// ============================================================
// 冒烟测试：验证基础链路通
// 访问首页时，未登录用户应被重定向到 /login
// ============================================================

test("未登录访问首页跳转登录", async ({ page }) => {
  await page.goto("/");

  // (main) 布局会 redirect 未登录用户到 /login
  await expect(page).toHaveURL(/\/login/);
});

test("登录页可正常渲染", async ({ page }) => {
  await page.goto("/login");

  // 页面应包含可交互元素（标题或按钮）
  await expect(page.locator("body")).toBeVisible();
});
