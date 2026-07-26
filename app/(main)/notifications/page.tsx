import { NotificationsList } from "./NotificationsList";

export const dynamic = "force-dynamic";

export const metadata = { title: "通知" };

// 服务端组件：仅提供 metadata 与入口，交互逻辑交给客户端 NotificationsList
export default function NotificationsPage() {
  return <NotificationsList />;
}
