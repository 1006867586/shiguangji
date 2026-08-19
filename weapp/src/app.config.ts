export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/roulette/index",
    "pages/profile/index",
    "pages/login/index",
    "pages/login-confirm/index",
    "pages/favorites/index",
    "pages/favorites-import/index",
    "pages/favorite-edit/index",
    "pages/webview/index",
  ],
  tabBar: {
    custom: true,
    color: "#9ca3af",
    selectedColor: "#ff6b35",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: [
      { pagePath: "pages/index/index", text: "收藏" },
      { pagePath: "pages/roulette/index", text: "转盘" },
      { pagePath: "pages/profile/index", text: "我的" },
    ],
  },
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTitleText: "飨刻",
    navigationBarTextStyle: "black",
  },
});
