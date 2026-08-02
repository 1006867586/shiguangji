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

test("/join 页面可加载", async ({ page }) => {
  const res = await page.goto("/join");

  // 页面应返回 200
  expect(res?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();

  // 应有标题或按钮可见（未登录态渲染 “加入圈子” 标题与 “去登录” 按钮）
  await expect(page.locator("h1, button").first()).toBeVisible();
});

test("移动端 viewport 下登录页可渲染", async ({ page }) => {
  // 模拟移动端视口
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/login");

  await expect(page.locator("body")).toBeVisible();
});
