// 路由切换时内容区入场动画：每次导航都会重新挂载，触发淡入+轻微上滑
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
