/**
 * 自定义底栏图标（真实 PNG 文件，由 config 的 copy 拷入 dist/assets/tab-icons，
 * Image 用包内绝对路径加载；SVG/base64 在 custom-tab-bar 中均不渲染）。
 */
export const TAB_ICONS: Record<string, string> = {
  home_gray: "/assets/tab-icons/home-gray.png",
  home_white: "/assets/tab-icons/home-white.png",
  wheel_gray: "/assets/tab-icons/wheel-gray.png",
  wheel_white: "/assets/tab-icons/wheel-white.png",
  user_gray: "/assets/tab-icons/user-gray.png",
  user_white: "/assets/tab-icons/user-white.png",
};
