import { useCallback, useEffect, useRef, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Canvas, Button, Picker } from "@tarojs/components";
import { isLoggedIn } from "@/utils/auth";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import {
  fetchGroups,
  fetchMealRoulette,
  addMealRouletteItem,
  importMealRouletteItems,
  deleteMealRouletteItem,
  fetchFavoritePlaces,
  type GroupLite,
  type MealRouletteItem,
} from "@/utils/api";
import "./index.scss";

/**
 * 转盘页（TabBar）：今天吃啥？
 *
 * 两种模式：
 * 1. 默认菜系 — 内置 6 大菜系（火锅/日料/烧烤/川菜/粤菜/西餐），无需圈子
 * 2. 圈子店铺池 — 选择圈子后加载该圈子的候选店铺
 *
 * Canvas 2D 绘制扇形，外层 View CSS transition 旋转 4s ease-out。
 */

const SPIN_MS = 4000;
const EASE = "cubic-bezier(0.17, 0.67, 0.12, 0.99)";

/** 设计稿 6 色：火锅/日料/烧烤/川菜/粤菜/西餐 */
const SLICE_COLORS = [
  "#FF6B3D", // 火锅 橙红
  "#FFA040", // 日料 橙
  "#FF8C42", // 烧烤 橙
  "#F25C7A", // 川菜 粉
  "#3DC2B8", // 粤菜 青
  "#4A4AE8", // 西餐 紫
];

/** 默认菜系候选（本地转盘模式，不绑定圈子） */
const DEFAULT_CUISINES: MealRouletteItem[] = [
  { id: "c1", group_id: "", title: "火锅", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c2", group_id: "", title: "日料", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c3", group_id: "", title: "烧烤", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c4", group_id: "", title: "川菜", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c5", group_id: "", title: "粤菜", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c6", group_id: "", title: "西餐", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
];

async function promptText(title: string, placeholder: string): Promise<string | null> {
  const res = await Taro.showModal({
    title,
    editable: true,
    placeholderText: placeholder,
  } as never);
  const r = res as { confirm: boolean; content?: string };
  return r.confirm ? (r.content ?? "") : null;
}

interface Canvas2DNode {
  width: number;
  height: number;
  getContext: (type: "2d") => CanvasRenderingContext2D;
}

export default function RoulettePage() {
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [groupIdx, setGroupIdx] = useState(0); // 0 = 默认菜系
  const [items, setItems] = useState<MealRouletteItem[]>(DEFAULT_CUISINES);
  const [loading, setLoading] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<MealRouletteItem | null>(null);
  const [history, setHistory] = useState<MealRouletteItem[]>([]);

  const accRef = useRef(0);
  const canvasRef = useRef<Canvas2DNode | null>(null);
  const itemsRef = useRef<MealRouletteItem[]>(DEFAULT_CUISINES);

  // ---- 加载圈子列表 ----
  useDidShow(() => {
    setSelectedTab(3);
    if (!isLoggedIn()) return;
    fetchGroups()
      .then((list) => {
        setGroups(list ?? []);
      })
      .catch(() => {});
  });

  // ---- 加载候选池 ----
  const loadItems = useCallback(async (gid: string | null) => {
    if (!gid) {
      // 默认菜系模式
      itemsRef.current = DEFAULT_CUISINES;
      setItems(DEFAULT_CUISINES);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchMealRoulette(gid);
      const finalList = list?.length ? list : DEFAULT_CUISINES;
      itemsRef.current = finalList;
      setItems(finalList);
    } catch {
      itemsRef.current = DEFAULT_CUISINES;
      setItems(DEFAULT_CUISINES);
    } finally {
      setLoading(false);
    }
  }, []);

  // 圈子切换
  const onGroupChange = useCallback(
    (e: { detail: { value: number } }) => {
      const idx = e.detail.value;
      setGroupIdx(idx);
      setWinner(null);
      if (idx === 0) {
        void loadItems(null);
      } else {
        const g = groups[idx - 1];
        if (g) void loadItems(g.id);
      }
    },
    [groups, loadItems]
  );

  // ---- 转盘绘制 ----
  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const query = Taro.createSelectorQuery();
    query
      .select("#wheel")
      .fields({ size: true })
      .exec((res) => {
        const size = (res?.[0] as { width?: number })?.width ?? 300;
        const dpr = Taro.getSystemInfoSync().pixelRatio || 2;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);

        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2 - 6;
        const list = itemsRef.current;

        ctx.clearRect(0, 0, size, size);

        if (list.length === 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = "#f5f2ed";
          ctx.fill();
          ctx.fillStyle = "#9ca3af";
          ctx.font = "15px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("先添加候选", cx, cy);
          ctx.textAlign = "left";
          return;
        }

        const slice = (Math.PI * 2) / list.length;
        for (let i = 0; i < list.length; i++) {
          const start = -Math.PI / 2 + i * slice;
          const end = start + slice;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, start, end);
          ctx.closePath();
          ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length];
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();

          // 文字
          const mid = start + slice / 2;
          const tx = cx + Math.cos(mid) * r * 0.62;
          const ty = cy + Math.sin(mid) * r * 0.62;
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(mid + Math.PI / 2);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 13px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          let label = list[i].title;
          if (ctx.measureText(label).width > r * 0.42) {
            while (
              label.length > 1 &&
              ctx.measureText(`${label}…`).width > r * 0.42
            ) {
              label = label.slice(0, -1);
            }
            label = `${label}…`;
          }
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }

        // 中心圆
        ctx.beginPath();
        ctx.arc(cx, cy, 28, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#ff6b35";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
  }, []);

  useEffect(() => {
    const init = () => {
      const query = Taro.createSelectorQuery();
      query
        .select("#wheel")
        .fields({ node: true })
        .exec((res) => {
          const node = (res?.[0] as { node?: Canvas2DNode })?.node;
          if (!node) return;
          canvasRef.current = node;
          drawWheel();
        });
    };
    const timer = setTimeout(init, 50);
    return () => clearTimeout(timer);
  }, [drawWheel]);

  useEffect(() => {
    if (canvasRef.current) drawWheel();
  }, [items, drawWheel]);

  // ---- 开转 ----
  const spin = () => {
    if (spinning || items.length < 2) return;
    setWinner(null);
    setSpinning(true);
    const idx = Math.floor(Math.random() * items.length);
    const sliceDeg = 360 / items.length;
    const target = -(idx * sliceDeg + sliceDeg / 2);
    const base = accRef.current + 360 * 5;
    const next = base + (((target - base) % 360) + 360) % 360;
    accRef.current = next;
    setRotation(next);

    setTimeout(() => {
      setSpinning(false);
      const w = items[idx];
      setWinner(w);
      setHistory((prev) => [w, ...prev].slice(0, 5));
      Taro.showToast({
        title: `今天就吃「${w.title}」`,
        icon: "none",
        duration: 2500,
      });
    }, SPIN_MS + 100);
  };

  // ---- 候选管理（仅圈子模式）----
  const currentGroupId = groupIdx > 0 ? groups[groupIdx - 1]?.id : null;

  const addItem = async () => {
    if (!currentGroupId) return;
    const input = await promptText("添加候选", "输入店名");
    if (input === null) return;
    const title = input.trim();
    if (!title) {
      Taro.showToast({ title: "名称不能为空", icon: "none" });
      return;
    }
    try {
      await addMealRouletteItem(currentGroupId, { title });
      setWinner(null);
      void loadItems(currentGroupId);
    } catch {
      // request 层已 toast
    }
  };

  const importFavorites = async () => {
    if (!currentGroupId) return;
    Taro.showLoading({ title: "导入中…", mask: true });
    try {
      const places = await fetchFavoritePlaces();
      const valid = places.filter((p) => p.title);
      if (valid.length === 0) {
        Taro.hideLoading();
        Taro.showToast({ title: "收藏夹还是空的", icon: "none" });
        return;
      }
      const res = await importMealRouletteItems(
        currentGroupId,
        valid.map((p) => ({
          title: p.title,
          address: p.address ?? undefined,
          phone: p.phone ?? undefined,
          signatureDishes: p.signature_dishes ?? [],
        }))
      );
      Taro.hideLoading();
      Taro.showToast({
        title: `导入 ${res.inserted} 家${res.duplicated ? `，${res.duplicated} 家已存在` : ""}`,
        icon: "none",
        duration: 2500,
      });
      setWinner(null);
      void loadItems(currentGroupId);
    } catch {
      Taro.hideLoading();
    }
  };

  const removeItem = async (item: MealRouletteItem) => {
    if (!currentGroupId || spinning) return;
    const m = await Taro.showModal({
      title: "移除候选",
      content: `确定把「${item.title}」移出转盘？`,
    });
    if (!m.confirm) return;
    try {
      await deleteMealRouletteItem(currentGroupId, item.id);
      if (winner?.id === item.id) setWinner(null);
      void loadItems(currentGroupId);
    } catch {
      // request 层已 toast
    }
  };

  const callPhone = (phone?: string | null) => {
    if (!phone) return;
    Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {});
  };

  // ---- 未登录 ----
  if (!isLoggedIn()) {
    return (
      <View className="roulette-page placeholder">
        <View className="placeholder-emoji">🎲</View>
        <Text className="text-muted">登录后使用转盘功能</Text>
        <Button
          className="btn-login"
          onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
        >
          微信一键登录
        </Button>
      </View>
    );
  }

  const groupPickerList = ["默认菜系", ...groups.map((g) => g.name)];

  return (
    <View className="roulette-page has-tabbar">
      {/* 标题区 */}
      <View className="roulette-header">
        <Text className="roulette-title">今天吃啥？</Text>
        <Text className="roulette-subtitle">转一转，告别选择困难</Text>
      </View>

      {/* 圈子选择器 */}
      {groups.length > 0 && (
        <View className="group-selector">
          <Picker
            mode="selector"
            range={groupPickerList}
            value={groupIdx}
            onChange={onGroupChange as never}
          >
            <View className="selector-display">
              <Text className="selector-label">候选池</Text>
              <Text className="selector-value">{groupPickerList[groupIdx]}</Text>
              <Text className="selector-arrow">›</Text>
            </View>
          </Picker>
        </View>
      )}

      {/* 转盘 */}
      <View className="wheel-box">
        <View
          className="wheel-rotor"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: `transform ${SPIN_MS}ms ${EASE}`,
          }}
        >
          <Canvas type="2d" id="wheel" className="wheel-canvas" />
        </View>
        <View className="wheel-pointer" />
        <View
          className={`wheel-go ${spinning ? "spinning" : ""}`}
          onClick={spin}
        >
          <Text className="go-text">{spinning ? "…" : "GO"}</Text>
        </View>
      </View>

      {/* 中奖结果 */}
      {winner && (
        <View className="winner-card">
          <Text className="winner-title">今天就吃「{winner.title}」</Text>
          {winner.address && (
            <View className="winner-row">
              <Text className="winner-label">地址</Text>
              <Text className="winner-value">{winner.address}</Text>
            </View>
          )}
          {winner.phone && (
            <View
              className="winner-row"
              onClick={() => callPhone(winner.phone)}
            >
              <Text className="winner-label">电话</Text>
              <Text className="winner-value">{winner.phone}（点击拨打）</Text>
            </View>
          )}
          {winner.signature_dishes && winner.signature_dishes.length > 0 && (
            <View className="winner-dishes">
              {winner.signature_dishes.map((d) => (
                <Text key={d} className="dish-tag">
                  {d}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 最近结果 */}
      {history.length > 0 && (
        <View className="history-section">
          <Text className="history-title">最近结果</Text>
          <View className="history-tags">
            {history.map((h, i) => (
              <Text
                key={`${h.id}-${i}`}
                className={`history-tag ${i === 0 ? "latest" : ""}`}
              >
                {h.title}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* 候选池管理（仅圈子模式）*/}
      {currentGroupId && (
        <View className="pool-card">
          <View className="pool-header">
            <Text className="pool-title">候选池（{items.length}）</Text>
            <View className="pool-actions">
              <Button size="mini" onClick={() => void addItem()}>
                ＋ 添加
              </Button>
              <Button
                size="mini"
                type="primary"
                onClick={() => void importFavorites()}
              >
                导入收藏
              </Button>
            </View>
          </View>

          {loading && items.length === 0 && (
            <Text className="pool-empty">加载中…</Text>
          )}
          {!loading && items.length === 0 && (
            <Text className="pool-empty">还没有候选，添加几家或从收藏夹导入</Text>
          )}

          {items.map((it) => (
            <View key={it.id} className="pool-item">
              <View className="pool-item-main">
                <View className="pool-item-title-row">
                  <Text className="pool-item-title">{it.title}</Text>
                  {it.adder?.nickname && (
                    <Text className="pool-item-adder">
                      {it.adder.nickname} 添加
                    </Text>
                  )}
                </View>
                {(it.address || it.phone) && (
                  <Text className="pool-item-sub">
                    {[it.address, it.phone].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </View>
              <Text
                className="pool-item-del"
                onClick={() => void removeItem(it)}
              >
                删
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
