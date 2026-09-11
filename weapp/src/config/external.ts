/**
 * 外部小程序跳转配置。
 *
 * 原内嵌的「点餐」改为跳转到专有点餐小程序。
 * 需要提供目标小程序的 AppID 与打开路径（path，从目标小程序后台获取）。
 */
export const POINTING_APP: { appId: string; path: string } = {
  appId: "wx80f0625b91e0327b",
  path: "pages/index/index",
};