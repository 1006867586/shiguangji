"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Link2, Sparkles, X, Camera, ChevronDown, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GroupSelector } from "@/components/group/GroupSelector";
import { ExternalLinkCard } from "@/components/activity/ExternalLinkCard";
import { FavoritePlacePicker } from "@/components/activity/FavoritePlacePicker";
import { createActivity } from "@/hooks/useActivity";
import { useAiParseScreenshot, useAiCopywrite } from "@/hooks/useAi";
import { useUpload } from "@/hooks/useUpload";
import { useAiEnabled } from "@/hooks/useAiEnabled";
import { fetchData } from "@/lib/fetcher";
import { isUrl, detectPlatform, extractUrlFromText } from "@/lib/utils";
import type { ExternalLink, FavoritePlace, Group } from "@/types";

/** 文案风格选项 */
const COPY_STYLES = [
  { value: "casual", label: "轻松日常" },
  { value: "formal", label: "正式礼貌" },
  { value: "humorous", label: "幽默搞怪" },
  { value: "enthusiastic", label: "热情安利" },
] as const;

type CopyStyleValue = (typeof COPY_STYLES)[number]["value"];

interface ActivityFormProps {
  defaultGroupId?: string;
  groups: Group[];
  repostOfId?: string;
  repostAuthorName?: string;
}

export function ActivityForm({
  defaultGroupId,
  groups,
  repostOfId,
  repostAuthorName,
}: ActivityFormProps) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [externalLink, setExternalLink] = useState<ExternalLink | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // AI 相关
  const aiEnabled = useAiEnabled();
  const { parse: parseScreenshot, loading: screenshotLoading } =
    useAiParseScreenshot();
  const { generate: generateCopy, loading: copyLoading } = useAiCopywrite();
  const { uploadFile, uploading, progress } = useUpload();

  // 截图识别文件 input 引用
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  // 文案风格 + 候选文案选择器
  const [copyStyle, setCopyStyle] = useState<CopyStyleValue>("casual");
  const [copiesOpen, setCopiesOpen] = useState(false);
  const [dialogCopies, setDialogCopies] = useState<string[]>([]);
  // 收藏夹选取器
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
  }, [groups, groupId]);

  // ---- AI 截图识别：上传图片 → 调 AI → 回填 externalLink / content ----
  const handleScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空 input，便于重复选择同一文件
    e.target.value = "";
    if (!file) return;
    try {
      // 1. 上传到 R2 拿到公开 URL
      const imageUrl = await uploadFile(file, "image");
      if (!imageUrl) return;
      // 2. 调 AI 识别
      const parsed = await parseScreenshot(imageUrl);
      // 3. 回填 externalLink（已有则合并，没有则创建）
      setExternalLink((prev) => ({
        platform: prev?.platform ?? "other",
        url: prev?.url ?? "",
        title: parsed.title || prev?.title || "",
        coverImage: prev?.coverImage ?? null,
        rating: parsed.rating ?? prev?.rating ?? null,
        address: parsed.address || prev?.address || null,
        phone: parsed.phone || prev?.phone || null,
        price: parsed.averagePrice ?? prev?.price ?? null,
        category: parsed.category ?? prev?.category ?? null,
      }));
      // 4. 招牌菜追加到 content
      if (parsed.signatureDishes && parsed.signatureDishes.length > 0) {
        const dishesText = `招牌菜：${parsed.signatureDishes.join("、")}`;
        setContent((prev) => (prev ? `${prev}\n${dishesText}` : dishesText));
      }
      toast.success("截图识别完成，已自动填入");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "截图识别失败");
    }
  };

  const triggerScreenshot = () => {
    screenshotInputRef.current?.click();
  };

  // ---- 从收藏夹选取：选中后回填 externalLink + 招牌菜追加到 content ----
  const handlePickFavorite = (place: FavoritePlace) => {
    setExternalLink((prev) => ({
      platform: prev?.platform ?? "other",
      url: prev?.url ?? "",
      title: place.title || prev?.title || "",
      coverImage: prev?.coverImage ?? null,
      rating: prev?.rating ?? null,
      address: place.address || prev?.address || null,
      phone: place.phone || prev?.phone || null,
      price: prev?.price ?? null,
    }));
    if (place.signature_dishes.length > 0) {
      const dishesText = `招牌菜：${place.signature_dishes.join("、")}`;
      setContent((prev) => (prev ? `${prev}\n${dishesText}` : dishesText));
    }
    toast.success("已从收藏夹填入");
  };

  // ---- AI 文案生成：取店名 → 生成 3 版 → 弹选择器 ----
  const handleGenerateCopy = async () => {
    const title = externalLink?.title?.trim();
    if (!title) {
      toast.info("请先填写店名或解析链接，AI 才能帮你写文案");
      return;
    }
    const selectedGroup = groups.find((g) => g.id === groupId);
    try {
      const result = await generateCopy({
        title,
        style: copyStyle,
        groupName: selectedGroup?.name,
      });
      if (result && result.length > 0) {
        setDialogCopies(result);
        setCopiesOpen(true);
      } else {
        toast.info("暂无可用的文案");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文案生成失败");
    }
  };

  const pickCopy = (text: string) => {
    setContent(text);
    setCopiesOpen(false);
    toast.success("已填入文案");
  };

  // 截图识别整体 busy（上传中或识别中）
  const screenshotBusy = uploading || screenshotLoading;
  const screenshotLabel = uploading
    ? `上传中 ${progress}%`
    : screenshotLoading
      ? "识别中…"
      : "AI 识别截图";

  const styleLabel =
    COPY_STYLES.find((s) => s.value === copyStyle)?.label ?? "轻松日常";

  const parseLink = async () => {
    const input = linkUrl.trim();
    if (!input) {
      toast.error("请输入链接或分享文本");
      return;
    }
    // 支持纯 URL 或含 URL 的分享文本
    const extractedUrl = extractUrlFromText(input);
    if (!isUrl(input) && !extractedUrl) {
      toast.error("未识别到有效链接");
      return;
    }
    setParsing(true);
    try {
      const res = await fetchData<{ fallback?: boolean } & ExternalLink>(
        "/api/link-preview",
        {
          method: "POST",
          body: JSON.stringify({ url: input }),
        }
      );
      setExternalLink(res);
      if (res.fallback) {
        toast.info("无法自动解析，请手动补充标题与封面");
      } else {
        toast.success("已解析链接");
      }
    } catch {
      // 降级：直接使用基础信息
      const fallbackUrl = extractedUrl ?? input;
      setExternalLink({
        platform: detectPlatform(fallbackUrl),
        url: fallbackUrl,
        title: "",
        coverImage: null,
        rating: null,
        address: null,
        phone: null,
        price: null,
      });
      toast.info("解析失败，可手动补充信息");
    } finally {
      setParsing(false);
    }
  };

  const updateLinkField = (field: keyof ExternalLink, value: string) => {
    setExternalLink((prev) =>
      prev ? { ...prev, [field]: value || null } : prev
    );
  };

  const submit = async () => {
    if (!groupId) {
      toast.error("请选择团体");
      return;
    }
    if (!content.trim() && !externalLink && !repostOfId) {
      toast.error("请填写内容或粘贴链接");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createActivity({
        groupId,
        content: content.trim() || undefined,
        externalLink: externalLink ?? undefined,
        repostOfId: repostOfId,
        repostComment: repostOfId ? content.trim() || undefined : undefined,
      });
      toast.success("发布成功");
      router.push(`/g/${groupId}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 团体选择 */}
      <div className="space-y-1.5">
        <Label htmlFor="group-select">发布到</Label>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            你还未加入任何团体，请先{" "}
            <a href="/groups/new" className="text-primary hover:underline">
              创建团体
            </a>{" "}
            或{" "}
            <a href="/join" className="text-primary hover:underline">
              加入团体
            </a>
          </p>
        ) : (
          <GroupSelector
            id="group-select"
            currentGroupId={groupId}
            onSelect={(g) => setGroupId(g.id)}
          />
        )}
      </div>

      {/* 分享提示 */}
      {repostOfId ? (
        <div className="rounded-xl border border-border/70 bg-muted/40 p-3 text-sm">
          <p className="text-muted-foreground">
            分享 <span className="font-medium text-foreground">@{repostAuthorName}</span> 的动态
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            下方输入框内容将作为分享附言
          </p>
        </div>
      ) : null}

      {/* 文字内容 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="content">
            {repostOfId ? "附言（可选）" : "想说点什么"}
          </Label>
          {aiEnabled && !repostOfId ? (
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={copyLoading}
                  >
                    风格：{styleLabel}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {COPY_STYLES.map((s) => (
                    <DropdownMenuItem
                      key={s.value}
                      onSelect={() => setCopyStyle(s.value)}
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleGenerateCopy}
                disabled={copyLoading}
                className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary touch-manipulation active:scale-[0.97]"
              >
                  {copyLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI 帮我写
              </Button>
            </div>
          ) : null}
        </div>
        <Textarea
          id="content"
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            repostOfId
              ? "添加分享附言…"
              : "今晚吃火锅！@大家 7点老地方见"
          }
          rows={4}
          maxLength={1000}
          autoComplete="off"
        />
        <div className="text-right text-xs text-muted-foreground">
          {content.length}/1000
        </div>
      </div>

      {/* 外部链接 */}
      {repostOfId ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="link-url">美团/点评链接（可选）</Label>
          <div className="flex gap-2">
            <Input
              id="link-url"
              name="link-url"
              type="url"
              inputMode="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="粘贴美团分享文本或链接…"
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  parseLink();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={parseLink}
              disabled={parsing || !linkUrl.trim()}
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              解析
            </Button>
          </div>

          {/* AI 截图识别 / 从收藏夹选取：自动回填店名/地址/电话 */}
          <div className="flex flex-wrap items-center gap-2">
            {aiEnabled ? (
              <>
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshot}
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={triggerScreenshot}
                  disabled={screenshotBusy}
                  className="gap-1 text-xs text-primary hover:text-primary touch-manipulation active:scale-[0.97]"
                >
                  {screenshotBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  {screenshotLabel}
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPickerOpen(true)}
              className="gap-1 text-xs text-primary hover:text-primary touch-manipulation active:scale-[0.97]"
            >
              <Bookmark className="h-3.5 w-3.5" />
              从收藏夹选取
            </Button>
          </div>

          {externalLink ? (
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Link2 className="h-3 w-3" />
                  链接卡片预览
                </span>
                <button
                  type="button"
                  onClick={() => setExternalLink(null)}
                  aria-label="清除链接"
                  className="text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <Input
                value={externalLink.title ?? ""}
                onChange={(e) => updateLinkField("title", e.target.value)}
                placeholder="标题（如：海底捞火锅）"
                aria-label="标题"
                autoComplete="off"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={externalLink.address ?? ""}
                  onChange={(e) => updateLinkField("address", e.target.value)}
                  placeholder="地址"
                  aria-label="地址"
                  autoComplete="off"
                />
                <Input
                  value={externalLink.phone ?? ""}
                  onChange={(e) => updateLinkField("phone", e.target.value)}
                  placeholder="电话"
                  aria-label="电话"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={externalLink.rating?.toString() ?? ""}
                  onChange={(e) =>
                    setExternalLink((prev) =>
                      prev
                        ? {
                            ...prev,
                            rating: e.target.value
                              ? parseFloat(e.target.value) || null
                              : null,
                          }
                        : prev
                    )
                  }
                  placeholder="评分（如 4.5）"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  aria-label="评分"
                  autoComplete="off"
                />
                <Input
                  value={externalLink.price ?? ""}
                  onChange={(e) => updateLinkField("price", e.target.value)}
                  placeholder="人均（如 ¥80/人）"
                  aria-label="人均"
                  autoComplete="off"
                />
              </div>
              <Input
                value={externalLink.category ?? ""}
                onChange={(e) => updateLinkField("category", e.target.value)}
                placeholder="分类（如 火锅/烤肉/川菜）"
                aria-label="分类"
                autoComplete="off"
              />
              <Input
                value={externalLink.coverImage ?? ""}
                onChange={(e) =>
                  updateLinkField("coverImage", e.target.value)
                }
                placeholder="封面图 URL"
                aria-label="封面图 URL"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />

              <ExternalLinkCard link={externalLink} />
            </div>
          ) : null}
        </div>
      )}

      {/* 提交 */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
          className="touch-manipulation active:scale-[0.97]"
        >
          取消
        </Button>
        <Button
          onClick={submit}
          disabled={submitting || !groupId}
          className="shadow-sm touch-manipulation active:scale-[0.97]"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          发布
        </Button>
      </div>

      {/* AI 文案候选选择器 */}
      <Dialog open={copiesOpen} onOpenChange={setCopiesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              选一版文案
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {dialogCopies.map((text, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => pickCopy(text)}
                className="w-full rounded-lg border border-border bg-card p-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation active:scale-[0.99]"
              >
                {text}
              </button>
            ))}
            {dialogCopies.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                暂无候选文案
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* 从收藏夹选取 */}
      <FavoritePlacePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePickFavorite}
      />
    </div>
  );
}
