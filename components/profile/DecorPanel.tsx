"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Loader2, Save, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BadgeGlow } from "@/components/decor/BadgeIcon";
import { BadgeSticker, hasBadgeSticker } from "@/components/decor/BadgeSticker";
import { UserAvatar } from "@/components/common/UserAvatar";
import { WornBadges } from "@/components/profile/WornBadges";
import { fetchData } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { DecorItem, DecorResponse, DecorKind } from "@/types";

interface DecorPanelProps {
  initialData: DecorResponse;
  profile: { nickname: string; avatar_url: string | null } | null;
}

type Tab = DecorKind;

/** 我的装扮：预览 + 头像框 + 徽章 佩戴/商城兑换 */
export function DecorPanel({ initialData, profile }: DecorPanelProps) {
  const router = useRouter();
  const [items, setItems] = useState<DecorItem[]>(initialData.items);
  const [points, setPoints] = useState(initialData.points);
  const [avatarFrameId, setAvatarFrameId] = useState<string | null>(
    initialData.display?.avatar_frame_id ?? null
  );
  const [badgeIds, setBadgeIds] = useState<string[]>(
    initialData.display?.badge_ids ?? []
  );
  const [tab, setTab] = useState<Tab>("badge");
  const [saving, setSaving] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const badgeItems = useMemo(
    () => items.filter((it) => it.kind === "badge"),
    [items]
  );
  const frameItems = useMemo(
    () => items.filter((it) => it.kind === "avatar_frame"),
    [items]
  );

  const frame = items.find((it) => it.id === avatarFrameId) ?? null;
  const wornBadges = badgeIds
    .map((id) => items.find((it) => it.id === id))
    .filter((it): it is DecorItem => !!it);

  /** 商店购买：扣积分 + 记为已拥有 */
  const purchase = async (item: DecorItem) => {
    if (purchasing) return;
    setPurchasing(item.id);
    try {
      const res = await fetchData<{ points: number; item_id: string }>(
        "/api/decor/purchase",
        {
          method: "POST",
          body: JSON.stringify({ itemId: item.id }),
        }
      );
      setPoints(res.points);
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, owned: true } : it))
      );
      toast.success(`已兑换 ${item.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "兑换失败");
    } finally {
      setPurchasing(null);
    }
  };

  /** 保存佩戴配置（头像框 + 徽章） */
  const saveDisplay = async () => {
    setSaving(true);
    try {
      await fetchData("/api/decor", {
        method: "PUT",
        body: JSON.stringify({ avatarFrameId, badgeIds }),
      });
      toast.success("装扮已更新");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  /** 点击徽章：已拥有则切换佩戴 */
  const toggleBadge = (item: DecorItem) => {
    if (!item.owned) return;
    setBadgeIds((prev) =>
      prev.includes(item.id)
        ? prev.filter((id) => id !== item.id)
        : [...prev, item.id]
    );
  };

  const TabButton = ({ value, label }: { value: Tab; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={cn(
        "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        tab === value
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="pb-24">
      {/* 预览 + 积分 */}
      <div className="p-4">
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl"
          />
          <div className="relative flex items-center gap-4">
            <div className="relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-md"
              />
              <UserAvatar
                profile={profile}
                size={72}
                frameColor={frame?.color}
                className="relative"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold tracking-tight">
                {profile?.nickname ?? "用户"}
              </p>
              <div className="mt-1 flex items-center gap-1 text-primary">
                <Coins className="h-4 w-4" />
                <span className="text-sm font-semibold tabular-nums">{points}</span>
                <span className="text-xs text-muted-foreground">积分</span>
              </div>
              <div className="mt-2">
                {wornBadges.length > 0 ? (
                  <WornBadges badges={wornBadges} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    还没佩戴徽章，去选一枚吧
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4">
        <div className="flex gap-1 rounded-xl border border-border/70 bg-muted/50 p-1">
          <TabButton value="badge" label="徽章" />
          <TabButton value="avatar_frame" label="头像框" />
        </div>
      </div>

      {/* 徽章列表 */}
      {tab === "badge" ? (
        <div className="mt-3 grid grid-cols-2 gap-2 px-4 sm:grid-cols-3">
          {badgeItems.map((item) => {
            const worn = badgeIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  "relative overflow-hidden rounded-xl border p-3 transition-colors",
                  worn
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/70 bg-card"
                )}
              >
                {hasBadgeSticker(item.key) ? (
                  <BadgeSticker
                    badgeKey={item.key}
                    rarity="common"
                    color={item.color}
                    name={item.name}
                    decorative
                    className="mx-auto h-11 w-11"
                  />
                ) : (
                  <BadgeGlow
                    badgeKey={item.key}
                    color={item.color}
                    icon={item.icon}
                    name={item.name}
                    decorative
                    className="mx-auto h-11 w-11 text-xl"
                  />
                )}
                <p className="mt-2 truncate text-center text-xs font-semibold">
                  {item.name}
                </p>
                <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-center text-[10px] leading-tight text-muted-foreground">
                  {item.description ?? ""}
                </p>

                {item.owned ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={worn ? "default" : "outline"}
                    className="mt-2 w-full gap-1"
                    onClick={() => toggleBadge(item)}
                  >
                    {worn ? "取消佩戴" : "佩戴"}
                  </Button>
                ) : item.unlock_type === "shop" && item.price > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full gap-1"
                    disabled={purchasing !== null}
                    onClick={() => purchase(item)}
                  >
                    {purchasing === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Coins className="h-3.5 w-3.5" />
                    )}
                    {item.price}
                  </Button>
                ) : (
                  <div className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <Shield className="h-3.5 w-3.5" />
                    未解锁
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* 头像框列表 */
        <div className="mt-3 grid grid-cols-3 gap-2 px-4 sm:grid-cols-4">
          {frameItems.map((item) => {
            const selected = avatarFrameId === item.id;
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border p-2.5 transition-colors",
                  selected
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/70 bg-card"
                )}
              >
                <div className="mx-auto flex items-center justify-center">
                  <UserAvatar
                    profile={profile}
                    size={48}
                    frameColor={item.color}
                  />
                </div>
                <p className="mt-2 truncate text-center text-xs font-semibold">
                  {item.name}
                </p>
                {item.owned ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    className="mt-2 w-full gap-1"
                    onClick={() =>
                      setAvatarFrameId(selected ? null : item.id)
                    }
                  >
                    {selected ? "卸下" : "使用"}
                  </Button>
                ) : item.unlock_type === "shop" && item.price > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full gap-1"
                    disabled={purchasing !== null}
                    onClick={() => purchase(item)}
                  >
                    {purchasing === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Coins className="h-3.5 w-3.5" />
                    )}
                    {item.price}
                  </Button>
                ) : (
                  <div className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    未解锁
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 底部保存 */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button
          type="button"
          className="w-full gap-2 shadow-sm transition-transform active:scale-[0.99]"
          disabled={saving}
          onClick={saveDisplay}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存装扮
        </Button>
      </div>
    </div>
  );
}