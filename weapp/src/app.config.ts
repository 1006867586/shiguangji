export default defineAppConfig({
  pages: [
    "pages/demo/index",
    "pages/index/index",
    "pages/publish/index",
    "pages/profile/index",
    "pages/login/index",
    "pages/detail/index",
    "pages/groups/index",
    "pages/group-detail/index",
    "pages/notifications/index",
    "pages/favorites/index",
    "pages/favorites-import/index",
    "pages/favorite-edit/index",
    "pages/poster/index",
    "pages/webview/index",
  ],
  subPackages: [
    { root: "subpackages/roulette", pages: ["index"] },
  ],
  tabBar: {
    color: "#8a8a8a",
    selectedColor: "#16a34a",
    backgroundColor: "#ffffff",
    borderStyle: "black",
    list: [
      { pagePath: "pages/index/index", text: "动态" },
      { pagePath: "pages/publish/index", text: "发布" },
      { pagePath: "pages/profile/index", text: "我的" },
    ],
  },
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTitleText: "想聚",
    navigationBarTextStyle: "black",
  },
});
