import { PropsWithChildren } from "react";
import { useLaunch } from "@tarojs/taro";
import { ensureSession } from "./utils/auth";
import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 启动时静默校验本地会话（不阻塞页面渲染，失败由请求层引导登录）
    void ensureSession();
  });

  return children;
}

export default App;
