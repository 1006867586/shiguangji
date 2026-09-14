"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  Bookmark,
  MapPin,
  Phone,
  Utensils,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/EmptyState";
import {
  RouletteWheel,
  useAccumulatedRotation,
} from "@/components/meal-roulette/RouletteWheel";
import { useMealRoulette, pickRandomIndex } from "@/hooks/useMealRoulette";
import { useFavoritePlaces } from "@/hooks/useFavoritePlaces";
import { fetchData, fetcher } from "@/lib/fetcher";
import { DIETARY_TAGS, dietaryLabel } from "@/lib/dietary";
import type {
  Group,
  MealRouletteItem,
  DrawRouletteResult,
  GroupDietaryResponse,
} from "@/types";

interface MealRouletteClientProps {
  groups: Group[];
  defaultGroupId: string;
}

const SPIN_MS = 4000;

export function MealRouletteClient({
  groups,
  defaultGroupId,
}: MealRouletteClientProps) {
  const [groupId, setGroupId] = useState(
    defaultGroupId || groups[0]?.id || ""
  );
  const { items, loading, add, importMany, remove } = useMealRoulette(groupId);

  // 转盘状态
  const labels = useMemo(() => items.map((i) => i.title), [items]);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [winner, setWinner] = useState<MealRouletteItem | null>(null);
  const acc = useAccumulatedRotation();
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 上一次抽中的索引：本次抽取排除它，避免连续抽中同一家 */
  const lastIndexRef = useRef<number | null>(null);

  // ---- 忌口相关状态 ----
  /** 圈子成员忌口数据（含汇总，抽签过滤用） */
  const [memberDietary, setMemberDietary] =
    useState<GroupDietaryResponse | null>(null);
  /** 不参与本次聚餐的成员 userId（默认空 = 全员参与） */
  const [offMembers, setOffMembers] = useState<Set<string>>(new Set());
  /** 是否启用忌口过滤：开启后优先抽能满足所有人忌口的餐厅 */
  const [strictDietary, setStrictDietary] = useState(true);
  /** 抽签元信息（实际模式 / 排除数 / 忌口提醒） */
  const [drawResult, setDrawResult] = useState<DrawRouletteResult | null>(null);

  // 切换圈子时拉取该圈子的成员忌口，并清空上一轮的勾选状态
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setMemberDietary(null);
    setOffMembers(new Set());
    void fetcher<{ data: GroupDietaryResponse }>(
      `/api/groups/${groupId}/dietary`
    )
      .then((res) => {
        if (!cancelled) setMemberDietary(res.data ?? null);
      })
      .catch(() => {
        // 忌口是增强能力，拉取失败不应阻塞转盘使用
        if (!cancelled) setMemberDietary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  /** 本次参与成员的 userId；全员参与时为空数组（服务端按全员处理） */
  const participantIds = useMemo(() => {
    if (!memberDietary) return [];
    return memberDietary.members
      .filter((m) => !offMembers.has(m.user_id))
      .map((m) => m.user_id);
  }, [memberDietary, offMembers]);

  useEffect(() => {
    return () => {
      if (spinTimer.current) clearTimeout(spinTimer.current);
    };
  }, []);

  /**
   * 抽签：优先走服务端（按忌口过滤），失败时降级为本地随机。
   *
   * 降级不是可有可无的兜底——忌口能力依赖迁移 033，若用户还没执行 SQL，
   * draw 接口会报错；这时转盘必须照常能用，否则就是新功能把老功能搞坏了。
   */
  const handleSpin = async () => {
    if (spinning || items.length < 2) return;
    setSpinning(true);
    setWinnerIndex(null);
    setWinner(null);
    setDrawResult(null);

    let idx = -1;
    let result: DrawRouletteResult | null = null;
    try {
      const res = await fetchData<{ data: DrawRouletteResult }>(
        `/api/groups/${groupId}/meal-roulette/draw`,
        {
          method: "POST",
          body: JSON.stringify({
            participantIds,
            mode: strictDietary ? "strict" : "loose",
          }),
        }
      );
      result = res.data ?? null;
      // 先取值再比较：闭包内的 result 无法被 TS 收窄，直接用会报 possibly null
      const pickedId = result?.picked?.id;
      if (pickedId) {
        idx = items.findIndex((i) => i.id === pickedId);
      }
    } catch {
      // 服务端不可用 → 交给下面的本地随机补位
      idx = -1;
    }

    if (idx < 0) {
      idx = pickRandomIndex(items.length, lastIndexRef.current ?? undefined);
      result = null;
    }
    if (idx < 0) {
      setSpinning(false);
      return;
    }

    lastIndexRef.current = idx;
    const target = acc.next(idx, items.length);
    setRotation(target);
    spinTimer.current = setTimeout(() => {
      setSpinning(false);
      setWinnerIndex(idx);
      setWinner(items[idx]);
      setDrawResult(result);
      toast.success(`今天就吃「${items[idx].title}」！`);
    }, SPIN_MS);
  };

  const handleReset = () => {
    setWinnerIndex(null);
    setWinner(null);
    setDrawResult(null);
    acc.reset();
    setRotation(0);
  };

  // 添加弹窗
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    title: "",
    address: "",
    phone: "",
    dishes: "",
    cuisine: "",
    dietaryTags: [] as string[],
  });
  const [adding, setAdding] = useState(false);

  // 从收藏夹导入弹窗
  const [favOpen, setFavOpen] = useState(false);
  const [favKeyword, setFavKeyword] = useState("");
  const [favSelected, setFavSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const { places: favPlaces, loading: favLoading } = useFavoritePlaces();

  const filteredFav = useMemo(() => {
    const k = favKeyword.trim().toLowerCase();
    if (!k) return favPlaces;
    return favPlaces.filter(
      (p) =>
        p.title.toLowerCase().includes(k) ||
        (p.address ?? "").toLowerCase().includes(k) ||
        p.signature_dishes.some((d) => d.toLowerCase().includes(k))
    );
  }, [favPlaces, favKeyword]);

  const handleAdd = async () => {
    const title = addForm.title.trim();
    if (!title) {
      toast.error("请填写店名");
      return;
    }
    setAdding(true);
    try {
      await add({
        title,
        address: addForm.address.trim() || null,
        phone: addForm.phone.trim() || null,
        signatureDishes: addForm.dishes
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        cuisine: addForm.cuisine.trim() || null,
        dietaryTags: addForm.dietaryTags,
      });
      toast.success("已添加");
      setAddForm({
        title: "",
        address: "",
        phone: "",
        dishes: "",
        cuisine: "",
        dietaryTags: [],
      });
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    const selected = favPlaces.filter((p) => favSelected.has(p.id));
    if (selected.length === 0) {
      toast.error("请至少选择一家");
      return;
    }
    setImporting(true);
    try {
      const res = await importMany({
        items: selected.map((p) => ({
          title: p.title,
          address: p.address,
          phone: p.phone,
          signatureDishes: p.signature_dishes,
        })),
      });
      const parts: string[] = [];
      if (res.inserted > 0) parts.push(`新增 ${res.inserted} 家`);
      if (res.duplicated > 0) parts.push(`${res.duplicated} 家已存在`);
      toast.success(parts.length ? parts.join("，") : "没有变化");
      setFavOpen(false);
      setFavSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const toggleFav = (id: string) => {
    setFavSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRemove = async (id: string) => {
    try {
      await remove(id);
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="space-y-5">
      {/* 圈子选择 */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">圈子</Label>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <Badge variant="secondary" className="text-[11px]">
          候选 {items.length}
        </Badge>
      </div>

      {/* 忌口与参与者 */}
      {memberDietary && memberDietary.members.length > 0 ? (
        <details className="rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs">
          <summary className="cursor-pointer select-none text-sm font-medium">
            忌口与参与者
            {memberDietary.summary.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {memberDietary.summary.length} 类忌口
              </span>
            ) : null}
          </summary>
          <div className="mt-2.5 space-y-2.5 border-t border-border/60 pt-2.5">
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={strictDietary}
                onChange={(e) => setStrictDietary(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="font-medium">优先避开忌口</span>
                <span className="block text-[11px] leading-relaxed text-muted-foreground">
                  只抽能满足所有参与者忌口的餐厅；若没有合适的会自动放开并给出提醒
                </span>
              </span>
            </label>

            <div>
              <p className="text-[11px] text-muted-foreground">
                本餐参与者（取消勾选 = 这次不来）
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {memberDietary.members.map((m) => {
                  const on = !offMembers.has(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setOffMembers((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.user_id)) next.delete(m.user_id);
                          else next.add(m.user_id);
                          return next;
                        })
                      }
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        on
                          ? "border-primary/30 bg-primary/10 font-medium text-primary"
                          : "border-border/60 bg-muted/40 text-muted-foreground line-through"
                      }`}
                    >
                      {m.nickname}
                      {m.dietary_tags.length > 0 ? (
                        <span className="text-[10px] opacity-70">
                          {m.dietary_tags.map(dietaryLabel).join("/")}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {memberDietary.summary.length > 0 ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                圈子忌口汇总：
                {memberDietary.summary
                  .map((s) => `${dietaryLabel(s.tag)} ${s.member_count} 人`)
                  .join("、")}
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                还没有成员填写忌口偏好。到「我的 → 忌口偏好」设置后，转盘会自动避开。
              </p>
            )}
          </div>
        </details>
      ) : null}

      {/* 转盘 */}
      <div className="flex flex-col items-center gap-4 py-2">
        <RouletteWheel
          labels={labels}
          spinning={spinning}
          winnerIndex={winnerIndex}
          rotation={rotation}
          onGoClick={handleSpin}
        />
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSpin}
            disabled={spinning || items.length < 2}
            className="gap-1.5 shadow-sm touch-manipulation active:scale-[0.97]"
          >
            {spinning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {spinning ? "转动中…" : items.length < 2 ? "至少 2 家才能转" : "开始转"}
          </Button>
          {winner ? (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={spinning}
              className="gap-1.5 touch-manipulation active:scale-[0.97]"
            >
              <RotateCcw className="h-4 w-4" />
              再转一次
            </Button>
          ) : null}
        </div>
      </div>

      {/* 选择结果（同小程序：珊瑚边框卡 + 标题「今天就吃 XX」） */}
      {/* 读屏播报区：常驻 sr-only，随 winner 更新播报抽中结果 */}
      <p aria-live="polite" className="sr-only">
        {winner ? `今天就吃${winner.title}` : "转盘待开始"}
      </p>
      {winner ? (
        <div className="rounded-2xl border-2 border-primary/60 bg-primary/5 p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
            <UtensilsCrossed className="h-3.5 w-3.5" />
            选择结果
          </div>
          <p className="text-lg font-semibold tracking-tight text-primary">
            今天就吃「{winner.title}」
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {winner.address ? (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {winner.address}
              </span>
            ) : null}
            {winner.phone ? (
              <span className="inline-flex items-center gap-0.5">
                <Phone className="h-3 w-3" />
                {winner.phone}
              </span>
            ) : null}
          </div>
          {winner.signature_dishes.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Utensils className="h-3 w-3 text-muted-foreground" />
              {winner.signature_dishes.map((d) => (
                <span
                  key={d}
                  className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                >
                  {d}
                </span>
              ))}
            </div>
          ) : null}

          {/* 忌口提醒：过滤只是锦上添花，这里才是真正有用的部分 */}
          {drawResult ? (
            <div className="mt-2.5 rounded-lg border border-border/60 bg-background/60 p-2.5">
              {drawResult.warnings.length > 0 ? (
                <>
                  <p className="text-xs font-medium">本局需注意</p>
                  <div className="mt-1 space-y-0.5">
                    {drawResult.warnings.map((w) => (
                      <p key={w.key} className="text-[11px] leading-relaxed text-muted-foreground">
                        {w.label}：{w.nicknames.join("、")}
                      </p>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  参与者没有忌口限制
                </p>
              )}
              {drawResult.mode === "strict" && drawResult.excludedCount > 0 ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  已按忌口排除 {drawResult.excludedCount} 家，本局候选{" "}
                  {drawResult.poolSize} 家
                </p>
              ) : drawResult.mode === "loose" &&
                drawResult.warnings.length > 0 ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  没有能完全避开忌口的餐厅，已放开限制，点菜时留意一下
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 候选池操作 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddOpen(true)}
          className="gap-1 touch-manipulation active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" />
          手动添加
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFavOpen(true)}
          className="gap-1 touch-manipulation active:scale-[0.97]"
        >
          <Bookmark className="h-3.5 w-3.5" />
          从收藏夹导入
        </Button>
      </div>

      {/* 候选池列表 */}
      {loading ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="h-8 w-8" />}
          title="候选池还是空的"
          description="手动添加或从收藏夹导入几家店，就能开始转盘啦"
        />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="group flex items-start gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs transition-all hover:border-border hover:shadow-md"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{it.title}</p>
                  {it.adder ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      @{it.adder.nickname ?? "成员"}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {it.address ? (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      <span className="line-clamp-1 max-w-[12rem]">
                        {it.address}
                      </span>
                    </span>
                  ) : null}
                  {it.phone ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Phone className="h-3 w-3" />
                      {it.phone}
                    </span>
                  ) : null}
                </div>
                {it.signature_dishes.length > 0 ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {it.signature_dishes.slice(0, 4).map((d) => (
                      <span
                        key={d}
                        className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(it.id)}
                aria-label="删除"
                className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 手动添加弹窗 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加候选店</DialogTitle>
            <DialogDescription>
              添加到「{groups.find((g) => g.id === groupId)?.name}」的候选池，圈子成员都会看到
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">店名</Label>
              <Input
                value={addForm.title}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="如：海底捞火锅"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">地址（可选）</Label>
                <Input
                  value={addForm.address}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, address: e.target.value }))
                  }
                  autoComplete="off"
                />
              </div>
              <div>
                <Label className="text-xs">电话（可选）</Label>
                <Input
                  value={addForm.phone}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  autoComplete="off"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">招牌菜（逗号分隔，可选）</Label>
              <Input
                value={addForm.dishes}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, dishes: e.target.value }))
                }
                placeholder="如：番茄锅、毛肚"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-xs">菜系 / 品类（可选）</Label>
              <Input
                value={addForm.cuisine}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, cuisine: e.target.value }))
                }
                placeholder="如：川菜、火锅、日料"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-xs">能照顾的忌口（可选）</Label>
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                勾选后，有相应忌口的成员参与时这家店会被优先抽中
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DIETARY_TAGS.map((tag) => {
                  const active = addForm.dietaryTags.includes(tag.key);
                  return (
                    <button
                      key={tag.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setAddForm((f) => ({
                          ...f,
                          dietaryTags: active
                            ? f.dietaryTags.filter((t) => t !== tag.key)
                            : [...f.dietaryTags, tag.key],
                        }))
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        active
                          ? "border-primary/30 bg-primary/10 font-medium text-primary"
                          : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={adding}
            >
              取消
            </Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 从收藏夹导入弹窗 */}
      <Dialog open={favOpen} onOpenChange={setFavOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>从收藏夹导入</DialogTitle>
            <DialogDescription>
              选择要加入候选池的店铺，已存在的会自动跳过
            </DialogDescription>
          </DialogHeader>
          <Input
            value={favKeyword}
            onChange={(e) => setFavKeyword(e.target.value)}
            placeholder="搜店名 / 地址 / 招牌菜…"
            className="h-9 text-sm"
            autoComplete="off"
          />
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {favLoading ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredFav.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {favPlaces.length === 0
                  ? "收藏夹还是空的"
                  : "没有匹配的店铺"}
              </p>
            ) : (
              filteredFav.map((p) => {
                const checked = favSelected.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleFav(p.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation active:scale-[0.99] ${
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-border/70 bg-card hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="h-4 w-4 accent-primary"
                      />
                    </div>
                    {p.address ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        <MapPin className="inline h-3 w-3" /> {p.address}
                      </p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFavOpen(false)}
              disabled={importing}
            >
              取消
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || favSelected.size === 0}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              导入 ({favSelected.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
