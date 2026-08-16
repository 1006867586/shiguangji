import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import {
  View,
  Text,
  Image,
  Textarea,
  Button,
  Picker,
  Input,
  ScrollView,
} from "@tarojs/components";
import { ApiError } from "@/utils/request";
import { isLoggedIn } from "@/utils/auth";
import { setSelectedTab } from "@/custom-tab-bar/tabStore";
import {
  fetchGroups,
  parseLink,
  createActivity,
  addActivityPhoto,
  msgSecCheck,
  fetchFavoritePlaces,
  PLATFORM_LABELS,
  type GroupLite,
  type LinkPreviewResult,
  type FavoritePlace,
} from "@/utils/api";
import { uploadToR2 } from "@/utils/upload";
import { safeDecodeURIComponent } from "@/utils/url";
import LoginGuide from "@/components/LoginGuide";
import "./index.scss";

const MAX_IMAGES = 9;

interface LocalImage {
  tempPath: string;
}

/**
 * 发布页：饭搭子选择 + 文字 + 图片（R2 直传）+ 链接解析 → 创建活动。
 * 提交顺序：先 createActivity（拿活动 id）→ 逐张直传 R2 → addActivityPhoto 挂到活动。
 */
export default function PublishPage() {
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPreview, setLinkPreview] = useState<LinkPreviewResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const prefillApplied = useRef(false);
  // ---- 从收藏夹选取 ----
  const [favOpen, setFavOpen] = useState(false);
  const [favList, setFavList] = useState<FavoritePlace[] | null>(null);
  const [favLoading, setFavLoading] = useState(false);
  const [favKeyword, setFavKeyword] = useState("");

  const loadGroups = useCallback(async () => {
    try {
      const list = await fetchGroups();
      setGroups(list);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        Taro.showToast({ title: "加载饭搭子失败", icon: "none" });
      }
    }
  }, []);

  useDidShow(() => {
    setSelectedTab(2);
    if (isLoggedIn() && groups.length === 0) void loadGroups();
  });

  useEffect(() => {
    if (isLoggedIn() && groups.length === 0) void loadGroups();
  }, [groups.length, loadGroups]);

  // 收藏卡片「发起聚餐」进入：预填店名/地址到正文草稿
  useEffect(() => {
    if (prefillApplied.current) return;
    prefillApplied.current = true;
    const params = Taro.getCurrentInstance().router?.params ?? {};
    // Taro params 可能已自动 decode，这里用安全解码（含 % 的店名不会崩）
    const title = safeDecodeURIComponent(params.title);
    const address = safeDecodeURIComponent(params.address);
    if (title) {
      setContent(
        [`【${title}】`, address ? `📍 ${address}` : "", "", "打算去吃，有人一起吗？"]
          .filter((line) => line !== undefined)
          .join("\n")
      );
    }
  }, []);

  // ---- 选图（压缩） ----
  const chooseImages = async () => {
    if (images.length >= MAX_IMAGES) {
      Taro.showToast({ title: `最多 ${MAX_IMAGES} 张`, icon: "none" });
      return;
    }
    try {
      const res = await Taro.chooseMedia({
        count: MAX_IMAGES - images.length,
        mediaType: ["image"],
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      const picked = res.tempFiles.map((f) => ({ tempPath: f.tempFilePath }));
      setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
    } catch {
      // 用户取消
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const previewImage = (current: string) => {
    Taro.previewImage({ current, urls: images.map((i) => i.tempPath) });
  };

  // ---- 链接解析 ----
  const handleParseLink = async (raw?: string) => {
    const input = (raw ?? linkUrl).trim();
    if (!input) {
      Taro.showToast({ title: "请粘贴链接或分享文本", icon: "none" });
      return;
    }
    setParsing(true);
    try {
      const res = await parseLink(input);
      if (res) {
        setLinkPreview(res);
        Taro.showToast({
          title: res.title ? "解析成功" : "已保存，可手动补充",
          icon: "none",
        });
      }
    } catch {
      // 降级：保留原始 URL
      setLinkPreview({
        platform: "other",
        url: input,
        title: "",
        coverImage: null,
        rating: null,
        address: null,
        phone: null,
        price: null,
      });
      Taro.showToast({ title: "解析失败，已保留链接", icon: "none" });
    } finally {
      setParsing(false);
    }
  };

  const clearLink = () => {
    setLinkPreview(null);
    setLinkUrl("");
  };

  // ---- 从收藏夹选取 ----
  const loadFavorites = useCallback(async () => {
    if (favLoading) return;
    setFavLoading(true);
    try {
      const list = await fetchFavoritePlaces();
      setFavList(list);
    } catch {
      // request 层已 toast（silent 时静默）
    } finally {
      setFavLoading(false);
    }
  }, [favLoading]);

  const openFavorites = () => {
    setFavOpen(true);
    if (favList === null) void loadFavorites();
  };

  const filteredFav = useMemo(() => {
    const k = favKeyword.trim().toLowerCase();
    if (!k) return favList ?? [];
    return (favList ?? []).filter(
      (p) =>
        p.title.toLowerCase().includes(k) ||
        (p.address ?? "").toLowerCase().includes(k) ||
        (p.signature_dishes ?? []).some((d) => d.toLowerCase().includes(k))
    );
  }, [favList, favKeyword]);

  const handlePickFavorite = (p: FavoritePlace) => {
    setFavOpen(false);
    // 预填正文草稿
    const lines = [`【${p.title}】`];
    if (p.address) lines.push(`📍 ${p.address}`);
    if (p.signature_dishes?.length) {
      lines.push(p.signature_dishes.slice(0, 3).join("、"));
    }
    lines.push("", "打算去吃，有人一起吗？");
    setContent(lines.join("\n"));
    // 店铺卡片：先用收藏夹数据本地生成（店名/评分/人均/地址/封面）；
    // 若店铺有链接再异步解析增强（可能拿到更全的封面/评分）
    setLinkUrl(p.store_url ?? "");
    setLinkPreview({
      platform: p.platform === "unknown" ? "other" : p.platform,
      url: p.store_url ?? "",
      title: p.title,
      coverImage: p.cover_image_url,
      rating: p.rating,
      address: p.address,
      phone: p.phone,
      price: p.price,
      category: p.category,
    });
    if (p.store_url) {
      void handleParseLink(p.store_url);
    }
  };

  // ---- 提交 ----
  const submit = async () => {
    if (submitting) return;
    const selectedGroup = groups[groupIndex];
    const text = content.trim();

    if (!selectedGroup) {
      Taro.showToast({ title: "请选择饭搭子", icon: "none" });
      return;
    }
    // 后端约束：内容或链接至少一项（照片仅作为附加媒体）
    if (!text && !linkPreview) {
      Taro.showToast({ title: "写点什么或粘贴商家链接", icon: "none" });
      return;
    }

    // 内容安全前置检测（scene 4 社交日志）；失败降级由服务端保证，拦截才中断
    if (text) {
      try {
        const sec = await msgSecCheck(text, 4);
        if (!sec.pass) {
          Taro.hideLoading();
          Taro.showModal({
            title: "内容无法发布",
            content: sec.reason ?? "内容包含违规信息，请修改后重试",
            showCancel: false,
          });
          return;
        }
      } catch {
        // 检测接口不可达：放行（服务端敏感词/入库校验兜底）
      }
    }

    setSubmitting(true);
    Taro.showLoading({ title: "发布中…", mask: true });
    try {
      // 1. 创建活动（内容 + 链接）
      const activity = await createActivity({
        groupId: selectedGroup.id,
        content: text || undefined,
        externalLink: linkPreview
          ? {
              platform: linkPreview.platform || "other",
              url: linkPreview.url || linkUrl.trim(),
              title: linkPreview.title || "",
              coverImage: linkPreview.coverImage,
              rating: linkPreview.rating,
              address: linkPreview.address,
              phone: linkPreview.phone,
              price: linkPreview.price,
              category: linkPreview.category,
            }
          : undefined,
      });
      if (!activity?.id) throw new Error("创建活动失败");

      // 2. 逐张直传 R2 并挂到活动
      for (let i = 0; i < images.length; i++) {
        Taro.showLoading({
          title: `上传图片 ${i + 1}/${images.length}`,
          mask: true,
        });
        const url = await uploadToR2(images[i].tempPath);
        await addActivityPhoto(activity.id, url, "image");
      }

      Taro.hideLoading();
      Taro.showToast({ title: "发布成功", icon: "success" });

      // 重置表单并回到打卡页
      setContent("");
      setImages([]);
      setLinkUrl("");
      setLinkPreview(null);
      setTimeout(() => {
        Taro.switchTab({ url: "/pages/index/index" });
      }, 800);
    } catch (err) {
      Taro.hideLoading();
      Taro.showToast({
        title: err instanceof Error ? err.message.slice(0, 30) : "发布失败",
        icon: "none",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoggedIn()) {
    return <LoginGuide subtitle="登录后即可发布饭局" />;
  }

  return (
    <View className="publish-page has-tabbar">
      {/* 顶栏：取消 / 发布 */}
      <View className="publish-topbar">
        <Text
          className="topbar-cancel"
          onClick={() => Taro.switchTab({ url: "/pages/index/index" })}
        >
          取消
        </Text>
        <Text className="topbar-title">发布</Text>
        <View
          className={`topbar-submit${submitting || groups.length === 0 ? " disabled" : ""}`}
          onClick={() => void submit()}
        >
          {submitting ? "发布中…" : "发布"}
        </View>
      </View>

      {/* 饭搭子选择 */}
      <View className="form-card">
        <Text className="form-label">发布到</Text>
        {groups.length > 0 ? (
          <Picker
            mode="selector"
            range={groups.map((g) => g.name)}
            value={groupIndex}
            onChange={(e) => setGroupIndex(Number(e.detail.value))}
          >
            <View className="group-picker">
              <Text>{groups[groupIndex]?.name}</Text>
              <Text className="picker-arrow">▾</Text>
            </View>
          </Picker>
        ) : (
          <Text className="text-muted">加载饭搭子中…（还没有饭搭子请先在 Web 端创建）</Text>
        )}
      </View>

      {/* 正文 */}
      <View className="form-card">
        <View className="content-toolbar">
          <Text className="form-label">正文</Text>
          <View className="pick-fav-btn" onClick={openFavorites}>
            <Text>从收藏夹选取</Text>
          </View>
        </View>
        <Textarea
          className="content-input"
          value={content}
          placeholder="分享你的聚餐故事…"
          maxlength={2000}
          onInput={(e) => setContent(e.detail.value)}
        />

        {/* 图片宫格 */}
        <View className="image-grid">
          {images.map((img, i) => (
            <View key={img.tempPath} className="image-cell">
              <Image
                className="preview-img"
                src={img.tempPath}
                mode="aspectFill"
                onClick={() => previewImage(img.tempPath)}
              />
              <View className="remove-btn" onClick={() => removeImage(i)}>
                <Text>×</Text>
              </View>
            </View>
          ))}
          {images.length < MAX_IMAGES && (
            <View className="image-cell add-cell" onClick={chooseImages}>
              <Text className="add-icon">＋</Text>
            </View>
          )}
        </View>
      </View>

      {/* 链接解析 */}
      <View className="form-card">
        <Text className="form-label">商家链接（可选）</Text>
        <View className="link-input-row">
          <Textarea
            className="link-input"
            value={linkUrl}
            placeholder="粘贴美团/点评分享文本或链接"
            maxlength={1000}
            autoHeight
            onInput={(e) => setLinkUrl(e.detail.value)}
          />
          <Button
            size="mini"
            type="primary"
            loading={parsing}
            disabled={!linkUrl.trim() || parsing}
            onClick={() => void handleParseLink()}
          >
            解析
          </Button>
        </View>

        {linkPreview && (
          <View className="parsed-card">
            <View className="parsed-main">
              <Text className="parsed-title">{linkPreview.title || "未识别到店名，可手动编辑"}</Text>
              <View className="parsed-tags">
                {linkPreview.rating ? (
                  <Text className="parsed-rating">★ {linkPreview.rating.toFixed(1)}</Text>
                ) : null}
                {linkPreview.price ? (
                  <Text className="parsed-tag">人均 {linkPreview.price}</Text>
                ) : null}
                {linkPreview.category ? (
                  <Text className="parsed-tag">{linkPreview.category}</Text>
                ) : null}
              </View>
              {linkPreview.address && (
                <Text className="parsed-row">{linkPreview.address}</Text>
              )}
              {linkPreview.phone && (
                <Text className="parsed-row">{linkPreview.phone}</Text>
              )}
            </View>
            {linkPreview.coverImage && (
              <Image className="parsed-cover" src={linkPreview.coverImage} mode="aspectFill" />
            )}
            <View className="parsed-clear" onClick={clearLink}>
              <Text>移除</Text>
            </View>
          </View>
        )}
      </View>

      {/* 从收藏夹选取弹层 */}
      {favOpen && (
        <View className="fav-sheet-mask" onClick={() => setFavOpen(false)}>
          <View className="fav-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="fav-sheet-title">
              <Text>从收藏夹选取</Text>
              <Text
                className="fav-sheet-close"
                onClick={() => setFavOpen(false)}
              >
                ✕
              </Text>
            </View>
            <Input
              className="fav-search"
              value={favKeyword}
              placeholder="搜店名 / 地址 / 招牌菜"
              onInput={(e) => setFavKeyword(e.detail.value)}
            />
            <ScrollView scrollY className="fav-list">
              {favLoading && favList === null ? (
                <Text className="fav-empty">加载中…</Text>
              ) : filteredFav.length === 0 ? (
                <Text className="fav-empty">
                  {favList === null || favList.length === 0
                    ? "收藏夹还是空的，去截图导入"
                    : "没有匹配的店铺"}
                </Text>
              ) : (
                filteredFav.map((p) => (
                  <View
                    key={p.id}
                    className="fav-item"
                    onClick={() => handlePickFavorite(p)}
                  >
                    <View className="fav-item-main">
                      <View className="fav-item-title-row">
                        <Text className="fav-item-title">{p.title}</Text>
                        {p.platform !== "unknown" && (
                          <Text className="fav-item-platform">
                            {PLATFORM_LABELS[p.platform]}
                          </Text>
                        )}
                      </View>
                      {p.address ? (
                        <Text className="fav-item-sub">{p.address}</Text>
                      ) : null}
                      {p.signature_dishes && p.signature_dishes.length > 0 ? (
                        <View className="fav-item-dishes">
                          {p.signature_dishes.slice(0, 3).map((d) => (
                            <Text key={d} className="fav-item-dish">
                              {d}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                    <Text className="fav-item-arrow">›</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
