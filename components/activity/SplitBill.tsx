"use client";

import { useEffect, useRef, useState } from "react";
import { Receipt, Loader2, Check, Plus, Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/common/UserAvatar";
import { useSplit } from "@/hooks/useSplit";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { useAiReceipt } from "@/hooks/useAi";
import { useUpload } from "@/hooks/useUpload";
import { useAiEnabled } from "@/hooks/useAiEnabled";
import type { ActivitySplit, UUID } from "@/types";

interface SplitBillProps {
  activityId: string;
  groupId: string;
  currentUserId?: string;
}

/** 分（cents）转元显示 */
function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * SplitBill — AA 分账组件。
 * - 已有分账：展示总额 / 每人应付 / 支付状态 / 标记已付按钮
 * - 无分账：展示「发起 AA 分账」按钮，点击打开创建表单
 * 创建表单支持平均 / 自定义两种分账模式。
 */
export function SplitBill({
  activityId,
  groupId,
  currentUserId,
}: SplitBillProps) {
  const { split, create, markPaid } = useSplit(activityId);
  const [showCreate, setShowCreate] = useState(false);
  const [togglingPaid, setTogglingPaid] = useState<UUID | null>(null);

  const handleMarkPaid = async (userId: UUID, paid: boolean) => {
    setTogglingPaid(userId);
    try {
      await markPaid(userId, paid);
      toast.success(paid ? "已标记为已付" : "已标记为未付");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setTogglingPaid(null);
    }
  };

  if (split) {
    return (
      <>
        <SplitDetail
          split={split}
          currentUserId={currentUserId}
          togglingPaid={togglingPaid}
          onMarkPaid={handleMarkPaid}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground touch-manipulation active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        发起 AA 分账
      </button>
      <CreateSplitDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        groupId={groupId}
        currentUserId={currentUserId}
        create={create}
      />
    </>
  );
}

/** 已有分账详情展示 */
function SplitDetail({
  split,
  currentUserId,
  togglingPaid,
  onMarkPaid,
}: {
  split: ActivitySplit;
  currentUserId?: string;
  togglingPaid: UUID | null;
  onMarkPaid: (userId: UUID, paid: boolean) => void;
}) {
  const participants = split.participants ?? [];
  const settledCount = participants.filter((p) => p.paid).length;
  const isCreator = split.created_by === currentUserId;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Receipt className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-foreground">
            {split.title || "AA 分账"}
          </span>
          {split.status === "settled" ? (
            <Badge variant="secondary" className="text-[10px]">
              已结清
            </Badge>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            ¥{formatYuan(split.total_amount)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {settledCount}/{participants.length} 已付
          </div>
        </div>
      </div>

      <Separator className="my-2.5" />

      <ul className="space-y-2">
        {participants.map((p) => {
          const isMe = p.user_id === currentUserId;
          const canMark = isMe || isCreator;
          return (
            <li key={p.id} className="flex items-center gap-2">
              <UserAvatar profile={p.profile} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-sm text-foreground">
                    {p.profile?.nickname ?? "用户"}
                  </span>
                  {isMe ? (
                    <Badge variant="outline" className="text-[10px]">
                      我
                    </Badge>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  应付 ¥{formatYuan(p.share_amount)}
                </div>
              </div>
              {p.paid ? (
                <Badge
                  variant="secondary"
                  className="gap-0.5 bg-emerald-500/15 text-emerald-600"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  已付
                </Badge>
              ) : canMark ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={togglingPaid === p.user_id}
                  onClick={() => onMarkPaid(p.user_id, true)}
                >
                  {togglingPaid === p.user_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "标记已付"
                  )}
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">未付</span>
              )}
            </li>
          );
        })}
        {participants.length === 0 ? (
          <li className="py-1 text-center text-xs text-muted-foreground">
            暂无参与者
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** 创建分账弹窗 */
function CreateSplitDialog({
  open,
  onOpenChange,
  groupId,
  currentUserId,
  create,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  currentUserId?: string;
  create: ReturnType<typeof useSplit>["create"];
}) {
  const { members, loading: membersLoading } = useGroupMembers(
    open ? groupId : null
  );
  const [title, setTitle] = useState("");
  const [totalYuan, setTotalYuan] = useState("");
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");
  const [selected, setSelected] = useState<Set<UUID>>(new Set());
  const [customShares, setCustomShares] = useState<Record<UUID, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // AI 小票识别
  const aiEnabled = useAiEnabled();
  const { parse: parseReceipt, loading: receiptLoading } = useAiReceipt();
  const { uploadFile, uploading, progress } = useUpload();
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // ---- AI 小票识别：上传图片 → 调 AI → 回填 totalYuan / title ----
  const handleReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const imageUrl = await uploadFile(file, "image");
      if (!imageUrl) return;
      const parsed = await parseReceipt(imageUrl);
      // 自动填入总金额（元）
      if (typeof parsed.totalAmount === "number" && parsed.totalAmount > 0) {
        setTotalYuan(parsed.totalAmount.toFixed(2));
      }
      // 自动填入标题（餐厅名）
      if (parsed.restaurantName) {
        setTitle((prev) => prev || parsed.restaurantName!);
      }
      toast.success(
        `小票识别完成${
          parsed.peopleCount ? `，检测到 ${parsed.peopleCount} 人` : ""
        }`
      );
      if (parsed.peopleCount && parsed.peopleCount > 0) {
        toast.info(
          `检测到 ${parsed.peopleCount} 人，可在下方手动勾选对应成员`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "小票识别失败");
    }
  };

  const triggerReceipt = () => {
    receiptInputRef.current?.click();
  };

  const receiptBusy = uploading || receiptLoading;
  const receiptLabel = uploading
    ? `上传中 ${progress}%`
    : receiptLoading
      ? "识别中…"
      : "拍小票自动填";

  // 打开弹窗时默认选中自己
  useEffect(() => {
    if (open && currentUserId && selected.size === 0) {
      setSelected(new Set([currentUserId]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUserId]);

  const toggleMember = (userId: UUID) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const totalCents = Math.round((parseFloat(totalYuan) || 0) * 100);
  const selectedCount = selected.size;

  // 平均模式下每人应付（元），用于展示
  const perPersonYuan =
    selectedCount > 0 && splitMode === "equal"
      ? (parseFloat(totalYuan) || 0) / selectedCount
      : 0;

  // 自定义模式份额合计（元）
  const customTotalYuan = Array.from(selected).reduce(
    (sum, uid) => sum + (customShares[uid] || 0),
    0
  );

  const canSubmit =
    selectedCount > 0 &&
    totalCents > 0 &&
    (splitMode === "equal" ||
      Math.abs(customTotalYuan - parseFloat(totalYuan || "0")) < 0.01);

  const reset = () => {
    setTitle("");
    setTotalYuan("");
    setSplitMode("equal");
    setCustomShares({});
    setSelected(currentUserId ? new Set([currentUserId]) : new Set());
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const shares: Record<UUID, number> = {};
      if (splitMode === "custom") {
        selected.forEach((uid) => {
          const yuan = customShares[uid] || 0;
          shares[uid] = Math.round(yuan * 100); // 元 → 分
        });
      }
      await create({
        title: title.trim() || undefined,
        totalAmount: totalCents,
        splitMode,
        participantIds: Array.from(selected),
        ...(splitMode === "custom" ? { shares } : {}),
      });
      toast.success("分账已创建");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>发起 AA 分账</DialogTitle>
          <DialogDescription>
            填写总金额与参与人，系统将按所选模式自动计算每人应付。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 标题 */}
          <div className="space-y-1.5">
            <label htmlFor="split-title" className="text-sm font-medium">
              标题
            </label>
            <Input
              id="split-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：周末聚餐"
              maxLength={50}
              disabled={submitting}
            />
          </div>

          {/* 总金额 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="split-total" className="text-sm font-medium">
                总金额（元）
              </label>
              {aiEnabled ? (
                <>
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleReceipt}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={triggerReceipt}
                    disabled={receiptBusy || submitting}
                    className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary touch-manipulation active:scale-[0.97]"
                  >
                    {receiptBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    {receiptLabel}
                  </Button>
                </>
              ) : null}
            </div>
            <Input
              id="split-total"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={totalYuan}
              onChange={(e) => setTotalYuan(e.target.value)}
              placeholder="0.00"
              disabled={submitting}
            />
          </div>

          {/* 分账模式 */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">分账模式</span>
            <div className="flex gap-1.5">
              {(["equal", "custom"] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={splitMode === m ? "default" : "outline"}
                  size="sm"
                  className="h-8 flex-1"
                  onClick={() => setSplitMode(m)}
                  disabled={submitting}
                >
                  {m === "equal" ? "平均分摊" : "自定义份额"}
                </Button>
              ))}
            </div>
            {splitMode === "equal" && selectedCount > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                每人应付 ¥{perPersonYuan.toFixed(2)}
              </p>
            ) : null}
            {splitMode === "custom" ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                已分配 ¥{customTotalYuan.toFixed(2)} / ¥
                {parseFloat(totalYuan || "0").toFixed(2)}
              </p>
            ) : null}
          </div>

          {/* 参与人 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                参与人（{selectedCount}）
              </span>
            </div>
            {membersLoading ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                加载成员列表…
              </div>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {members.map((m) => {
                  const checked = selected.has(m.user_id);
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted/50"
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(m.user_id)}
                          disabled={submitting}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <UserAvatar profile={m.profile} size={28} />
                        <span className="text-sm text-foreground">
                          {m.profile?.nickname ?? "用户"}
                          {m.user_id === currentUserId ? "（我）" : ""}
                        </span>
                      </label>
                      {splitMode === "custom" && checked ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={customShares[m.user_id] ?? ""}
                            onChange={(e) =>
                              setCustomShares((prev) => ({
                                ...prev,
                                [m.user_id]: parseFloat(e.target.value) || 0,
                              }))
                            }
                            placeholder="0.00"
                            disabled={submitting}
                            className="h-7 w-20 text-right text-xs"
                          />
                          <span className="text-xs text-muted-foreground">
                            元
                          </span>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {members.length === 0 ? (
                  <li className="py-2 text-center text-xs text-muted-foreground">
                    暂无成员
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "创建"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
