import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Image, Button, Input, Textarea } from "@tarojs/components";
import {
  parseFavoritesScreenshot,
  createFavoritePlaces,
  PLATFORM_LABELS,
  type FavoritePlatform,
  type ParsedPlaceDraft,
} from "@/utils/api";
import { uploadToR2 } from "@/utils/upload";
import "./index.scss";

/**
 * 截图导入收藏流程：
 * 1. chooseImage 选收藏页截图（可预览重选）
 * 2. R2 直传拿 publicUrl
 * 3. 智能识别（15-30s，loading 提示）
 * 4. 结果可编辑（店名/地址/电话），可删行
 * 5. 确认入库（enrichPoi: true 自动补齐电话/地址/品类）
 */

type Step = "pick" | "recognizing" | "review";

const PLATFORM_OPTIONS: FavoritePlatform[] = [
  "unknown",
  "meituan",
  "dianping",
  "xiaohongshu",
  "douyin",
];

export default function FavoritesImportPage() {
  const [step, setStep] = useState<Step>("pick");
  const [screenshotPath, setScreenshotPath] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [platform, setPlatform] = useState<FavoritePlatform>("unknown");
  const [platformIdx, setPlatformIdx] = useState(0);
  const [drafts, setDrafts] = useState<ParsedPlaceDraft[]>([]);
  const [saving, setSaving] = useState(false);

  // ---- 1. 选图 ----
  const chooseScreenshot = () => {
    Taro.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => setScreenshotPath(res.tempFilePaths[0]),
    });
  };

  const previewScreenshot = () => {
    if (screenshotPath) {
      Taro.previewImage({ urls: [screenshotPath] });
    }
  };

  // ---- 2+3. 上传 + 智能识别 ----
  const startRecognize = async () => {
    if (!screenshotPath || step === "recognizing") return;
    setStep("recognizing");
    try {
      Taro.showLoading({ title: "上传截图中…", mask: true });
      const uploadedUrl = await uploadToR2(screenshotPath);
      setScreenshotUrl(uploadedUrl);
      Taro.showLoading({ title: "智能识别中（15-30s）…", mask: true });
      const result = await parseFavoritesScreenshot({
        imageUrl: uploadedUrl,
        platform: platform === "unknown" ? undefined : platform,
      });
      Taro.hideLoading();
      if (!result?.places?.length) {
        Taro.showModal({
          title: "未识别到店铺",
          content: "截图里没找到店铺信息，请换一张更清晰的收藏页截图",
          showCancel: false,
        });
        setStep("pick");
        return;
      }
      setPlatform(result.platform ?? "unknown");
      setDrafts(result.places);
      setStep("review");
    } catch {
      Taro.hideLoading();
      // request 层已 toast（配额/超时/识别失败）
      setStep("pick");
    }
  };

  // ---- 4. 草稿编辑 ----
  const updateDraft = (idx: number, patch: Partial<ParsedPlaceDraft>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---- 5. 入库 ----
  const handleSave = async () => {
    if (saving) return;
    const cleaned = drafts.filter((d) => d.title.trim());
    if (cleaned.length === 0) {
      Taro.showToast({ title: "至少保留一家店铺", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      Taro.showLoading({ title: "保存中…", mask: true });
      await createFavoritePlaces({
        platform,
        sourceScreenshotUrl: screenshotUrl || undefined,
        enrichPoi: true,
        places: cleaned.map((d) => ({
          title: d.title.trim(),
          address: d.address?.trim() || null,
          phone: d.phone?.trim() || null,
          signatureDishes: d.signatureDishes ?? [],
          summary: d.summary ?? "",
          rating: d.rating ?? null,
          averagePrice: d.averagePrice ?? null,
          category: d.category ?? null,
        })),
      });
      Taro.hideLoading();
      Taro.showToast({ title: `已导入 ${cleaned.length} 家`, icon: "success" });
      setTimeout(() => Taro.navigateBack(), 600);
    } catch {
      Taro.hideLoading();
      // request 层已 toast
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setStep("pick");
    setDrafts([]);
    setScreenshotPath("");
    setScreenshotUrl("");
  };

  return (
    <View className="fi-page">
      {step === "pick" && (
        <View className="fi-pick">
          <View className="fi-shot-box" onClick={chooseScreenshot}>
            {screenshotPath ? (
              <Image
                className="fi-shot"
                src={screenshotPath}
                mode="aspectFill"
                onClick={(e) => {
                  e.stopPropagation();
                  previewScreenshot();
                }}
              />
            ) : (
              <View className="fi-shot-placeholder">
                <Text className="fi-shot-icon">📷</Text>
                <Text className="fi-shot-text">选择收藏页截图</Text>
                <Text className="fi-shot-hint">美团 / 大众点评 / 小红书</Text>
              </View>
            )}
          </View>

          <View className="fi-platform">
            <Text className="fi-label">来源平台（可留空自动判断）</Text>
            <View className="fi-platform-options">
              {PLATFORM_OPTIONS.map((p, i) => (
                <Text
                  key={p}
                  className={`fi-chip ${platformIdx === i ? "active" : ""}`}
                  onClick={() => {
                    setPlatformIdx(i);
                    setPlatform(p);
                  }}
                >
                  {PLATFORM_LABELS[p]}
                </Text>
              ))}
            </View>
          </View>

          <Button
            type="primary"
            disabled={!screenshotPath}
            onClick={startRecognize}
          >
            开始智能识别
          </Button>
        </View>
      )}

      {step === "review" && (
        <View className="fi-review">
          <View className="fi-review-header">
            <Text className="fi-review-title">
              识别到 {drafts.length} 家店铺
            </Text>
            <Text className="fi-review-hint">
              请核对信息，可直接修改；保存时自动补齐电话地址
            </Text>
          </View>

          {drafts.map((d, idx) => (
            <View key={idx} className="fi-draft">
              <View className="fi-draft-head">
                <Text className="fi-draft-idx">#{idx + 1}</Text>
                <Text className="fi-draft-del" onClick={() => removeDraft(idx)}>
                  移除
                </Text>
              </View>
              <Input
                className="fi-input"
                value={d.title}
                onInput={(e) => updateDraft(idx, { title: e.detail.value })}
                placeholder="店名（必填）"
              />
              <Input
                className="fi-input"
                value={d.address ?? ""}
                onInput={(e) =>
                  updateDraft(idx, { address: e.detail.value })
                }
                placeholder="地址（可留空，保存时自动补齐）"
              />
              <Input
                className="fi-input"
                value={d.phone ?? ""}
                onInput={(e) => updateDraft(idx, { phone: e.detail.value })}
                placeholder="电话（可留空，保存时自动补齐）"
              />
              <Textarea
                className="fi-textarea"
                value={d.summary}
                onInput={(e) => updateDraft(idx, { summary: e.detail.value })}
                placeholder="简介"
                maxlength={100}
                autoHeight
              />
            </View>
          ))}

          <Button type="primary" loading={saving} onClick={handleSave}>
            保存到收藏夹（{drafts.length} 家）
          </Button>
          <Button className="fi-btn-ghost" onClick={restart}>
            重新选择截图
          </Button>
        </View>
      )}
    </View>
  );
}
