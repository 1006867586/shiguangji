import { Suspense } from "react";
import { SearchResults } from "./SearchResults";

export const dynamic = "force-dynamic";

export const metadata = { title: "搜索" };

// 服务端组件：metadata + 入口；交互逻辑交给客户端 SearchResults
// SearchResults 内部使用 useSearchParams，需 Suspense 包裹以满足 Next.js 15 的预渲染约束
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchResults />
    </Suspense>
  );
}
