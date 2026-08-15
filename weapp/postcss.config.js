/**
 * 小程序端独立的 PostCSS 配置。
 *
 * 必须存在：postcss 配置查找会向上冒泡，若缺少本文件会命中仓库根目录
 * Web 项目的 postcss.config.mjs（tailwindcss 插件），导致 weapp 构建时
 * 因找不到 tailwindcss 模块而失败。
 *
 * pxtransform 等小程序必需插件由 Taro 构建链（config/index.ts 的
 * mini.postcss）注入，这里保持空即可。
 */
module.exports = {
  plugins: [],
};
