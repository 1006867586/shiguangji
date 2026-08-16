import { defineConfig, type UserConfigExport } from "@tarojs/cli";

import devConfig from "./dev";
import prodConfig from "./prod";
import path from "node:path";

// https://taro-docs.jd.com/docs/next/config#defineconfig-asterisk
export default defineConfig(async (merge) => {
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
