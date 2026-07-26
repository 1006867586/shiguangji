import { defineConfig } from "vitest/config";
import path from "node:path";

// ============================================================
// Vitest 配置
// 路径别名 @/* 与 tsconfig.json 保持一致（指向项目根目录）
// 测试环境用 jsdom，覆盖 lib 下的纯函数与 React 组件
// ============================================================

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e", "dist"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/**/__tests__/**"],
    },
  },
});
