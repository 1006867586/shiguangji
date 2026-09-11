import { defineConfig, type UserConfigExport } from "@tarojs/cli";

import devConfig from "./dev";
import prodConfig from "./prod";
import path from "node:path";
import fs from "node:fs";

// 加载项目根 .env，将 TARO_APP_* 写入 process.env。
// Taro 4 命令行构建不一定自动 load .env，这里显式 load，保证 API_BASE 等编译期可注入。
function loadDotEnv(): void {
  try {
    const p = path.resolve(__dirname, "..", ".env");
    const txt = fs.readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // .env 不存在则跳过，使用 config.ts 内的兜底
  }
}
loadDotEnv();

// https://taro-docs.jd.com/docs/next/config#defineconfig-asterisk
export default defineConfig(async (merge) => {
  // 编译期常量注入：让 src/utils/config.ts 里的 process.env.TARO_APP_API_BASE
  // 在构建时被替换成 .env 的实际值（小程序运行时没有 process.env，必须编译期替换）
  const defineConstants: Record<string, string> = {};
  if (process.env.TARO_APP_API_BASE) {
    defineConstants["process.env.TARO_APP_API_BASE"] = JSON.stringify(
      process.env.TARO_APP_API_BASE
    );
  }

  const baseConfig: UserConfigExport = {
    projectName: "xiangke-weapp",
    date: "2026-8-15",
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    outputRoot: "dist",
    plugins: [],
    framework: "react",
    compiler: "webpack5",
    defineConstants,
    copy: {
      patterns: [
        { from: "assets/tab-icons", to: "dist/assets/tab-icons" },
        { from: "assets/card-icons", to: "dist/assets/card-icons" },
      ],
      options: {},
    },
    alias: {
      "@": path.resolve(__dirname, "..", "src"),
      "@shared": path.resolve(__dirname, "..", "..", "types"),
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false, // 默认 false。如需使用 css modules 功能，则设为 true
        },
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
      },
    },
    h5: {},
  };

  if (process.env.NODE_ENV === "development") {
    // 本地开发配置（读取现存环境变量）
    return merge({}, baseConfig, devConfig);
  }
  // 生产构建配置（读取现存环境变量）
  return merge({}, baseConfig, prodConfig);
});
