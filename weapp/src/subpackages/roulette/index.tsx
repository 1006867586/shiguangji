import { useCallback, useEffect, useRef, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Canvas, Button } from "@tarojs/components";
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
 * 今天吃什么转盘（分包页面，从圈子详情进入）
 *
 * 数据源：圈子级共享候选池 meal_roulette_items（后端已有），
 * 支持手动添加 / 收藏夹批量导入（服务端同名同地址去重）。
 * 转盘：Canvas 2D 绘制扇形，外层 View CSS transition 旋转 4s ease-out，
 * 角度算法与 Web 版一致（累计正向旋转，指针指向中奖扇形中心）。
 */

const SPIN_MS = 4000;
const EASE = "cubic-bezier(0.17, 0.67, 0.12, 0.99)";

/** 12 色循环扇形色板（暖色为主，与 Web 版观感一致） */
const SLICE_COLORS = [
  "#f59e0b",
  "#f97316",
  "#fb7185",
  "#ef4444",
  "#ec4899",
  "#a855f7",
  "#8b5cf6",
  "#6366f1",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#84cc16",
];

/** 带输入框的确认弹窗（wx.showModal editable，Taro 4 类型未收录需断言） */
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
  const [groupId, setGroupId] = useState("");
  const [items, setItems] = useState<MealRouletteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<MealRouletteItem | null>(null);

  const accRef = useRef(0);
  const canvasRef = useRef<Canvas2DNode | null>(null);
  const itemsRef = useRef<MealRouletteItem[]>([]);

  const loadItems = useCallback(async (gid: string) => {
    setLoading(true);
    try {
      const list = await fetchMealRoulette(gid);
      itemsRef.current = list ?? [];
      setItems(list ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    const params = Taro.getCurrentInstance().router?.params ?? {};
    const gid = params.groupId ?? "";
    if (gid && gid !== groupId) {
      setGroupId(gid);
      void loadItems(gid);
    }
  });

  // ---- 转盘绘制 ----
  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const query = Taro.createSelectorQuery();
    query
      .select("#wheel")
      .fields({ size: true })
      .exec((res) => {
        const size = (res?.[0] as { width?: number })?.width ?? 345;
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
          ctx.fillStyle = "#f5f5f4";
          ctx.fill();
          ctx.fillStyle = "#a8a29e";
          ctx.font = "15px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("先添加候选店铺", cx, cy);
          ctx.textAlign = "left";
          return;
        }

        const slice = (Math.PI * 2) / list.length;
        // 顶部指针方向为 -90°，扇形 0 从顶部顺时针展开
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

          // 文字：径向放置，随扇形角度旋转
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
        ctx.arc(cx, cy, 26, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#e5e5e5";
        ctx.lineWidth = 1;
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

  // 候选变化后重绘
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
    // 指针（顶部）最终指向中奖扇形中心
    const target = -(idx * sliceDeg + sliceDeg / 2);
    // 累计正向旋转：至少再加 5 圈，目标角与当前累加角同余对齐
    const base = accRef.current + 360 * 5;
    const next =
      base + (((target - base) % 360) + 360) % 360;
    accRef.current = next;
    setRotation(next);

    setTimeout(() => {
      setSpinning(false);
      const w = items[idx];
      setWinner(w);
      Taro.showToast({
        title: `今晚就吃「${w.title}」`,
        icon: "none",
        duration: 2500,
      });
    }, SPIN_MS + 100);
  };

  // ---- 候选管理 ----
  const addItem = async () => {
    if (!groupId) return;
    const input = await promptText("添加候选", "输入店名");
    if (input === null) return;
    const title = input.trim();
    if (!title) {
      Taro.showToast({ title: "名称不能为空", icon: "none" });
      return;
    }
    try {
      await addMealRouletteItem(groupId, { title });
      setWinner(null);
      void loadItems(groupId);
    } catch {
      // request 层已 toast
    }
  };

  const importFavorites = async () => {
    if (!groupId) return;
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
        groupId,
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
      void loadItems(groupId);
    } catch {
      Taro.hideLoading();
    }
  };

  const removeItem = async (item: MealRouletteItem) => {
    if (!groupId || spinning) return;
    const m = await Taro.showModal({
      title: "移除候选",
      content: `确定把「${item.title}」移出转盘？`,
    });
    if (!m.confirm) return;
    try {
      await deleteMealRouletteItem(groupId, item.id);
      if (winner?.id === item.id) setWinner(null);
      void loadItems(groupId);
    } catch {
      // request 层已 toast
    }
  };

  const callPhone = (phone: string | null) => {
    if (!phone) return;
    Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {});
  };

  const copyAddress = (address: string | null) => {
    if (!address) return;
    Taro.setClipboardData({ data: address });
  };

  return (
    <View className="roulette-page">
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
      </View>

      <Button
        className="spin-btn"
        type="primary"
        loading={spinning}
        disabled={loading || items.length < 2 || spinning}
        onClick={spin}
      >
        {items.length < 2 ? "至少 2 家才能开转" : spinning ? "转动中…" : "开转！"}
      </Button>

      {/* 中奖结果 */}
      {winner && (
        <View className="winner-card">
          <Text className="winner-title">今晚就吃「{winner.title}」</Text>
          {winner.address && (
            <View className="winner-row" onClick={() => copyAddress(winner.address)}>
              <Text className="winner-label">地址</Text>
              <Text className="winner-value">{winner.address}（点击复制）</Text>
            </View>
          )}
          {winner.phone && (
            <View className="winner-row" onClick={() => callPhone(winner.phone)}>
              <Text className="winner-label">电话</Text>
              <Text className="winner-value">{winner.phone}（点击拨打）</Text>
            </View>
          )}
          {winner.signature_dishes?.length > 0 && (
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

      {/* 候选池管理 */}
      <View className="pool-card">
        <View className="pool-header">
          <Text className="pool-title">候选池（{items.length}）</Text>
          <View className="pool-actions">
            <Button size="mini" onClick={() => void addItem()}>
              ＋ 添加
            </Button>
            <Button size="mini" type="primary" onClick={() => void importFavorites()}>
              导入收藏夹
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
                  <Text className="pool-item-adder">{it.adder.nickname} 添加</Text>
                )}
              </View>
              {(it.address || it.phone) && (
                <Text className="pool-item-sub">
                  {[it.address, it.phone].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
            <Text className="pool-item-del" onClick={() => void removeItem(it)}>
              删
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
