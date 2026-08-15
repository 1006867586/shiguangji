export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/publish/index",
    "pages/profile/index",
    "pages/login/index",
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
