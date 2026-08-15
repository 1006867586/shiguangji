import type { UserConfigExport } from "@tarojs/cli";

export default {
  mini: {},
  h5: {
    /**
     * Web 端配置暂不启用（小程序优先），保留结构以便后续 H5 复用。
     */
  },
} satisfies UserConfigExport;
