import { useCallback, useEffect, useRef, useState } from "react";
import Taro, { useDidShow, useShareAppMessage } from "@tarojs/taro";
import { View, Text, Canvas, Button, Picker } from "@tarojs/components";
import { isLoggedIn } from "@/utils/auth";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import {
  fetchGroups,
  fetchMealRoulette,
  addMealRouletteItem,
  deleteMealRouletteItem,
  importMealRouletteItems,
  fetchFavoritePlaces,
  createRoulettePool,
  fetchRoulettePool,
  addRoulettePoolItem,
  deleteRoulettePoolItem,
  type GroupLite,
  type MealRouletteItem,
  type RoulettePool,
} from "@/utils/api";
import "./index.scss";

const SPIN_MS = 4000;

/** 设计稿 6 色：火锅/日料/烧烤/川菜/粤菜/西餐 */
const SLICE_COLORS = [
  "#FF6B3D", // 火锅 橙红
  "#FFA040", // 日料 橙
  "#FF8C42", // 烧烤 橙
  "#F25C7A", // 川菜 粉
  "#3DC2B8", // 粤菜 青
  "#4A4AE8", // 西餐 紫
];

/** 本地默认菜系候选（免登录模式） */
const DEFAULT_CUISINES: MealRouletteItem[] = [
  { id: "c1", group_id: "", title: "火锅", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c2", group_id: "", title: "日料", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c3", group_id: "", title: "烧烤", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c4", group_id: "", title: "川菜", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c5", group_id: "", title: "粤菜", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
  { id: "c6", group_id: "", title: "西餐", address: null, phone: null, signature_dishes: [], added_by: "", created_at: "" },
];

/** 转盘条目统一形态（圈子池 / 分享池 / 本地） */
interface WheelItem {
  id: string;
  title: string;
  address: string | null;
  phone: string | null;
  signature_dishes?: string[];
  added_by?: string;
  created_by?: string;
}

/** 本地已进入的分享池 */
interface LocalPool {
  code: string;
  name: string;
}

/** 将 hex 颜色向白色混合（amt 0~1），用于分段同色系渐变 */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amt));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt));
  const b = Math.min(255, Math.round((n & 255) + (255 - (n & 255)) * amt));
  return `rgb(${r},${g},${b})`;
}

const POOLS_KEY = "roulette_local_pools";
const ANON_KEY = "roulette_anon_id";

function loadLocalPools(): LocalPool[] {
  try {
    return Taro.getStorageSync<LocalPool[]>(POOLS_KEY) || [];
  } catch {
    return [];
  }
}

function saveLocalPools(pools: LocalPool[]) {
  Taro.setStorageSync(POOLS_KEY, pools);
}

/** 设备匿名 ID（免登录标识，用于分享池「仅删自己」） */
function getAnonId(): string {
  let id = Taro.getStorageSync<string>(ANON_KEY);
  if (!id) {
    id = `anon_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    Taro.setStorageSync(ANON_KEY, id);
  }
  return id;
}

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

type Source =
  | { type: "local" }
  | { type: "pool"; code: string; name: string }
  | { type: "group"; group: GroupLite };

export default function RoulettePage() {
  // 登录态用 state（登录页返回后 useDidShow 里更新，触发重渲染）
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [localPools, setLocalPools] = useState<LocalPool[]>(loadLocalPools());
  const [source, setSource] = useState<Source>({ type: "local" });
  const [sourceIdx, setSourceIdx] = useState(0);
  const [items, setItems] = useState<WheelItem[]>(DEFAULT_CUISINES);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<WheelItem | null>(null);
  const [history, setHistory] = useState<WheelItem[]>([]);

  // 转盘旋转用 ref（canvas 内部绘制动画，不依赖 CSS transform）
  const rotRef = useRef(0);            // 当前显示角度（累计）
  const canvasRef = useRef<Canvas2DNode | null>(null);
  const canvasSizeRef = useRef(0);     // 画布 CSS 尺寸
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 动画定时器
  const itemsRef = useRef<WheelItem[]>(DEFAULT_CUISINES);

  const anonId = getAnonId();

  /** 缓动：easeOutCubic（先快后慢） */
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  // ---- 候选池选择列表：默认菜系 / 分享池 / 圈子池 ----
  const pickerList = [
    "默认菜系",
    ...localPools.map((p) => (p.name || "分享池") + "（分享）"),
    ...groups.map((g) => g.name),
  ];

  const resolveSource = (idx: number): Source => {
    const poolCount = localPools.length;
    if (idx <= 0) return { type: "local" };
    if (idx <= poolCount) {
      const p = localPools[idx - 1];
      return { type: "pool", code: p.code, name: p.name };
    }
    const g = groups[idx - 1 - poolCount];
    return g ? { type: "group", group: g } : { type: "local" };
  };

  // ---- 加载候选池 ----
  const loadItems = useCallback(
    async (src: Source) => {
      if (src.type === "local") {
        itemsRef.current = DEFAULT_CUISINES;
        setItems(DEFAULT_CUISINES);
        return;
      }
      setLoading(true);
      try {
        if (src.type === "pool") {
          const res = await fetchRoulettePool(src.code);
          const list = res?.items ?? [];
          itemsRef.current = list.length ? list : DEFAULT_CUISINES;
          setItems(list.length ? list : DEFAULT_CUISINES);
        } else {
          const list = await fetchMealRoulette(src.group.id);
          const finalList = list?.length ? list : DEFAULT_CUISINES;
          itemsRef.current = finalList;
          setItems(finalList);
        }
      } catch {
        itemsRef.current = DEFAULT_CUISINES;
        setItems(DEFAULT_CUISINES);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ---- 切换候选池（旋转中禁止，避免中奖错乱）----
  const onSourceChange = useCallback(
    (e: { detail: { value: number } }) => {
      if (spinning) {
        Taro.showToast({ title: "转盘转动中，请稍候", icon: "none" });
        return;
      }
      const idx = e.detail.value;
      setSourceIdx(idx);
      setWinner(null);
      const src = resolveSource(idx);
      setSource(src);
      void loadItems(src);
    },
    [localPools, groups, loadItems, resolveSource, spinning]
  );

  // ---- 首次进入 / 分享链接进入 / 登录态刷新 ----
  useDidShow(() => {
    setSelectedTab(3);
    // 每次显示都重读登录态（登录页返回后更新）
    const cur = isLoggedIn();
    if (cur !== loggedIn) setLoggedIn(cur);
    const params = Taro.getCurrentInstance().router?.params ?? {};
    // 分享卡片进入：?pool=<code>
    const poolCode = (params.pool ?? "").toString().trim().toUpperCase();
    if (poolCode) {
      void enterPool(poolCode);
      return;
    }
    if (cur && groups.length === 0) {
      fetchGroups()
        .then((list) => setGroups(list ?? []))
        .catch(() => {});
    }
  });

  // 登录态变为已登录后加载圈子池
  useEffect(() => {
    if (loggedIn && groups.length === 0) {
      fetchGroups()
        .then((list) => setGroups(list ?? []))
        .catch(() => {});
    }
  }, [loggedIn, groups.length]);

  const enterPool = async (code: string) => {
    try {
      const res = await fetchRoulettePool(code);
      const pool: RoulettePool = res?.pool;
      if (!pool) {
        Taro.showToast({ title: "分享池不存在", icon: "none" });
        return;
      }
      // 记录到本地已进入列表（去重）
      const pools = loadLocalPools();
      if (!pools.some((p) => p.code === pool.code)) {
        const next = [{ code: pool.code, name: pool.name ?? "" }, ...pools].slice(0, 20);
        saveLocalPools(next);
        setLocalPools(next);
      }
      const idx = Math.max(0, loadLocalPools().findIndex((p) => p.code === pool.code));
      setSourceIdx(idx + 1);
      setSource({ type: "pool", code: pool.code, name: pool.name ?? "" });
      void loadItems({ type: "pool", code: pool.code, name: pool.name ?? "" });
    } catch {
      // request 层已 toast
    }
  };

  // ---- 新建分享池 ----
  const createPool = async () => {
    const input = await promptText("新建分享池", "给分享池起个名字（可选）");
    if (input === null) return;
    try {
      const pool = await createRoulettePool(input.trim() || undefined);
      const pools = loadLocalPools();
      const next = [{ code: pool.code, name: pool.name ?? "" }, ...pools].slice(0, 20);
      saveLocalPools(next);
      setLocalPools(next);
      setSourceIdx(1);
      setSource({ type: "pool", code: pool.code, name: pool.name ?? "" });
      void loadItems({ type: "pool", code: pool.code, name: pool.name ?? "" });
      Taro.showToast({ title: `分享池已创建，码 ${pool.code}`, icon: "none" });
    } catch {
      // request 层已 toast
    }
  };

  // ---- 分享：池模式下分享池，否则分享转盘页 ----
  useShareAppMessage(() => {
    if (source.type === "pool") {
      return {
        title: "来一起选今天吃什么！分享池已就绪",
        path: `/pages/roulette/index?pool=${source.code}`,
      };
    }
    return { title: "今天吃啥？转一转，告别选择困难", path: "/pages/roulette/index" };
  });

  // ---- 添加候选 ----
  const addItem = async () => {
    if (spinning) {
      Taro.showToast({ title: "转盘转动中，请稍候", icon: "none" });
      return;
    }
    const input = await promptText("添加候选", "输入店名");
    if (input === null) return;
    const title = input.trim();
    if (!title) {
      Taro.showToast({ title: "名称不能为空", icon: "none" });
      return;
    }
    try {
      if (source.type === "pool") {
        await addRoulettePoolItem(source.code, { title, createdBy: anonId });
      } else if (source.type === "group") {
        await addMealRouletteItem(source.group.id, { title });
      } else {
        Taro.showToast({ title: "默认菜系不可编辑", icon: "none" });
        return;
      }
      setWinner(null);
      void loadItems(source);
    } catch {
      // request 层已 toast
    }
  };

  // ---- 删除候选（分享池仅删自己的；圈子池成员可删） ----
  const removeItem = async (item: WheelItem) => {
    if (spinning) return;
    if (source.type === "pool" && item.created_by !== anonId) {
      Taro.showToast({ title: "只能删除自己添加的候选", icon: "none" });
      return;
    }
    if (source.type === "local") {
      Taro.showToast({ title: "默认菜系不可编辑", icon: "none" });
      return;
    }
    const m = await Taro.showModal({
      title: "移除候选",
      content: `确定把「${item.title}」移出？`,
    });
    if (!m.confirm) return;
    try {
      if (source.type === "pool") {
        await deleteRoulettePoolItem(item.id, anonId);
      } else if (source.type === "group") {
        await deleteMealRouletteItem(source.group.id, item.id);
      }
      if (winner?.id === item.id) setWinner(null);
      void loadItems(source);
    } catch {
      // request 层已 toast
    }
  };

  // ---- 圈子池专属：导入收藏 ----
  const importFavorites = async () => {
    if (source.type !== "group") return;
    if (spinning) {
      Taro.showToast({ title: "转盘转动中，请稍候", icon: "none" });
      return;
    }
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
        source.group.id,
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
      void loadItems(source);
    } catch {
      Taro.hideLoading();
    }
  };

  // ---- 转盘绘制（canvas 内部旋转，rotDeg 为累计角度）----
  const drawWheel = useCallback((rotDeg: number) => {
    const canvas = canvasRef.current;
    const size = canvasSizeRef.current;
    if (!canvas || !size) return;
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

    const rot = (rotDeg * Math.PI) / 180;
    const slice = (Math.PI * 2) / list.length;
    for (let i = 0; i < list.length; i++) {
      const start = -Math.PI / 2 + rot + i * slice;
      const end = start + slice;
      const mid = start + slice / 2;
      // 同色系渐变：中心偏亮、边缘用基础色
      const base = SLICE_COLORS[i % SLICE_COLORS.length];
      const grad = ctx.createLinearGradient(
        cx,
        cy,
        cx + Math.cos(mid) * r,
        cy + Math.sin(mid) * r
      );
      grad.addColorStop(0, lighten(base, 0.4));
      grad.addColorStop(1, base);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 文字
      const tx = cx + Math.cos(mid) * r * 0.62;
      const ty = cy + Math.sin(mid) * r * 0.62;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = 4;
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
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      ctx.restore();
    }
    // 中心留白给 DOM 层 GO 按钮（不再自绘白色圆）
  }, []);

  useEffect(() => {
    const init = () => {
      const query = Taro.createSelectorQuery();
      query
        .select("#wheel")
        .fields({ node: true, size: true })
        .exec((res) => {
          const node = (res?.[0] as { node?: Canvas2DNode })?.node;
          const width = (res?.[0] as { width?: number })?.width;
          if (!node) return;
          canvasRef.current = node;
          canvasSizeRef.current = width ?? 300;
          drawWheel(rotRef.current);
        });
    };
    const timer = setTimeout(init, 50);
    return () => clearTimeout(timer);
  }, [drawWheel]);

  useEffect(() => {
    if (canvasRef.current && canvasSizeRef.current) drawWheel(rotRef.current);
  }, [items, drawWheel]);

  // 卸载时清理动画
  useEffect(
    () => () => {
      if (animRef.current) clearTimeout(animRef.current);
    },
    []
  );

  // ---- 开转（canvas 内部动画，不依赖 CSS transform）----
  const spin = () => {
    if (spinning || items.length < 2) return;
    setWinner(null);
    setSpinning(true);
    const idx = Math.floor(Math.random() * items.length);
    const sliceDeg = 360 / items.length;
    const target = -(idx * sliceDeg + sliceDeg / 2);
    const base = rotRef.current + 360 * 5;
    const next = base + (((target - base) % 360) + 360) % 360;

    const from = rotRef.current;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / SPIN_MS);
      const cur = from + (next - from) * easeOutCubic(t);
      rotRef.current = cur;
      drawWheel(cur);
      if (t < 1) {
        animRef.current = setTimeout(tick, 16);
        return;
      }
      animRef.current = null;
      setSpinning(false);
      const w = items[idx];
      setWinner(w);
      setHistory((prev) => [w, ...prev].slice(0, 5));
      Taro.showToast({
        title: `今天就吃「${w.title}」`,
        icon: "none",
        duration: 2500,
      });
    };
    animRef.current = setTimeout(tick, 16);
  };

  const callPhone = (phone?: string | null) => {
    if (!phone) return;
    Taro.makePhoneCall({ phoneNumber: phone }).catch(() => {});
  };

  const currentGroupId = source.type === "group" ? source.group.id : null;

  return (
    <View className="roulette-page has-tabbar">
      {/* 标题区 */}
      <View className="roulette-header">
        <Text className="roulette-title">今天吃啥？</Text>
        <Text className="roulette-subtitle">转一转，告别选择困难</Text>
      </View>

      {/* 候选池选择器 + 新建分享池 */}
      <View className="group-selector">
        <Picker
          mode="selector"
          range={pickerList}
          value={sourceIdx}
          onChange={onSourceChange as never}
        >
          <View className="selector-display">
            <Text className="selector-label">候选池</Text>
            <Text className="selector-value">
              {pickerList[sourceIdx] ?? "默认菜系"}
            </Text>
            <Text className="selector-arrow">›</Text>
          </View>
        </Picker>
        <View className="selector-extra">
          <Button
            size="mini"
            className="pool-create-btn"
            onClick={() => void createPool()}
          >
            ＋ 新建分享池
          </Button>
          {source.type === "pool" && (
            <Button size="mini" type="primary" openType="share" className="pool-share-btn">
              邀请好友
            </Button>
          )}
        </View>
      </View>

      {/* 转盘（canvas 内部绘制旋转） */}
      <View className="wheel-box">
        <View className="wheel-rotor">
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

      {/* 候选池管理（默认菜系不可编辑；分享池/圈子池可增删） */}
      {source.type !== "local" && (
        <View className="pool-card">
          <View className="pool-header">
            <Text className="pool-title">
              {source.type === "pool"
                ? `分享池（${items.length}）· 码 ${source.code}`
                : `候选池（${items.length}）`}
            </Text>
            <View className="pool-actions">
              <Button size="mini" onClick={() => void addItem()}>
                ＋ 添加
              </Button>
              {source.type === "group" && (
                <Button
                  size="mini"
                  type="primary"
                  onClick={() => void importFavorites()}
                >
                  导入收藏
                </Button>
              )}
            </View>
          </View>

          {loading && items.length === 0 && (
            <Text className="pool-empty">加载中…</Text>
          )}
          {!loading && items.length === 0 && (
            <Text className="pool-empty">还没有候选，添加几家吧</Text>
          )}

          {items.map((it) => (
            <View key={it.id} className="pool-item">
              <View className="pool-item-main">
                <View className="pool-item-title-row">
                  <Text className="pool-item-title">{it.title}</Text>
                  {it.added_by && (
                    <Text className="pool-item-adder">成员添加</Text>
                  )}
                  {source.type === "pool" && it.created_by === anonId && (
                    <Text className="pool-item-adder">我添加的</Text>
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

      {/* 未登录提示（不影响默认菜系/分享池使用） */}
      {!loggedIn && source.type !== "pool" && (
        <View className="login-hint">
          <Text className="text-muted">
            登录后可使用圈子候选池；分享池免登录即可用
          </Text>
        </View>
      )}
    </View>
  );
}
