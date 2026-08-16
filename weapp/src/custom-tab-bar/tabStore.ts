/**
 * 自定义底栏共享状态：各 tab 页在 useDidShow 里调用 setSelectedTab
 * 同步高亮，custom-tab-bar 组件订阅后重渲染。
 */

type Listener = (index: number) => void;

let current = 0;
const listeners = new Set<Listener>();

export function getSelectedTab(): number {
  return current;
}

export function setSelectedTab(index: number): void {
  if (current === index) return;
  current = index;
  listeners.forEach((l) => l(current));
}

export function subscribeTab(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
