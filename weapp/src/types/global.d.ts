/// <reference types="@tarojs/taro" />

declare module "*.scss" {
  const resource: string;
  export default resource;
}

// Taro 编译宏（app.config.ts / *.config.ts 使用）
declare const defineAppConfig: <T>(config: T) => T;
declare const definePageConfig: <T>(config: T) => T;
