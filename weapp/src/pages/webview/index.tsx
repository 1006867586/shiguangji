import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { WebView } from "@tarojs/components";
import "./index.scss";

/**
 * 通用 WebView 跳转页（demo 页"隐私政策/用户协议"按钮入口）
 *
 * URL 通过 query 参数传入：?url=https://...&title=隐私政策
 *
 * 注意：必须在微信公众平台「开发管理 → 开发设置 → 业务域名」配置 https 域名
 * 才能用 <web-view> 加载 HTTPS 外链；否则会提示"不支持打开非业务域名"。
 */
export default function WebViewPage() {
  const [url, setUrl] = useState<string>("");
  const [title, setTitle] = useState<string>("");

  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params ?? {};
    const targetUrl = params.url ? decodeURIComponent(params.url) : "";
    const targetTitle = params.title ? decodeURIComponent(params.title) : "外部页面";
    setUrl(targetUrl);
    setTitle(targetTitle);
    Taro.setNavigationBarTitle({ title: targetTitle });
  }, []);

  if (!url) {
    return null;
  }

  return <WebView src={url} />;
}