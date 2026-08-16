export default defineAppConfig({
  // agent.skills：微信小程序 Agent 能力声明（供开发者工具 CLI/Agent 操作，
  // 上架时随小程序生效；SKILL.md 见 agent-skills/ 目录，由 config 的 copy 拷入 dist）
  agent: {
    skills: [
      {
        path: "agent-skills/xiangke",
        name: "想聚",
        description: "私密聚餐记录小程序：动态流、圈子、转盘、个人中心",
      },
    ],
  },
  pages: [
    "pages/demo/index",
    "pages/index/index",
    "pages/groups/index",
    "pages/publish/index",
    "pages/roulette/index",
    "pages/profile/index",
    "pages/login/index",
    "pages/detail/index",
    "pages/group-detail/index",
    "pages/notifications/index",
    "pages/favorites/index",
    "pages/favorites-import/index",
    "pages/favorite-edit/index",
    "pages/poster/index",
    "pages/webview/index",
  ],
  tabBar: {
    custom: true,
    color: "#9ca3af",
    selectedColor: "#ff6b35",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: [
      { pagePath: "pages/index/index", text: "动态" },
      { pagePath: "pages/groups/index", text: "圈子" },
      { pagePath: "pages/publish/index", text: "发布" },
      { pagePath: "pages/roulette/index", text: "转盘" },
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
