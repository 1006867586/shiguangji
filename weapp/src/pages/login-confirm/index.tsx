import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, Image, Input } from "@tarojs/components";
import { request, ApiError } from "@/utils/request";
import { saveSession, type WeappSession } from "@/utils/auth";
import { uploadToR2 } from "@/utils/upload";
import "./index.scss";

/**
 * 确认登录页 — PC 扫码登录链路的小程序端确认页。
 *
 * 进入方式：微信扫 PC 端展示的小程序码（getwxacodeunlimit，scene=sessionId）。
 * scene 参数由微信自动写入 onLoad options（Taro 中为 router.params.scene）。
 *
 * 用户可选：
 * - 选头像（chooseAvatar → R2 直传 → 拿到公网 URL 传给服务端）
 * - 改昵称（Input type="nickname"，微信原生会自动预填用户微信昵称，可改）
 *
 * 点击「确认登录」→ wx.login 拿 code → POST /api/auth/weapp/confirm-login
 * → 返回 token 本地保存（小程序顺带自动登录）→ PC 端轮询命中自动登录。
 *
 * 服务端仅在 isNewUser=true 时把 nickname / avatarUrl 写入 user_metadata 与 profiles；
 * 老用户重复扫码不会被覆盖。
 */
const NICKNAME_MAX = 20;

export default function LoginConfirmPage() {
  const [uuid, setUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // 用户资料（可选）
  const [avatarLocal, setAvatarLocal] = useState<string | null>(null); // 微信临时路径
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null); // R2 公网 URL
  const [uploading, setUploading] = useState(false);
  const [nickname, setNickname] = useState("");

  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params ?? {};
    const scene = String(params.scene ?? "").trim().toLowerCase();
    if (!scene) {
      setHint("无效的登录二维码，请回到 PC 端重新生成");
    } else {
      setUuid(scene);
    }
  }, []);

  /** 微信原生选头像 → 临时路径 → 上传 R2 → 公网 URL */
  const onChooseAvatar = async (e: { detail: { avatarUrl: string } }) => {
    const path = e.detail.avatarUrl;
    if (!path || uploading) return;
    setUploading(true);
    setAvatarLocal(path);
    try {
      const url = await uploadToR2(path);
      setAvatarUrl(url);
    } catch {
      // 上传失败由 upload 层 toast；avatarLocal 留作占位，用户可重新选
      setAvatarLocal(null);
    } finally {
      setUploading(false);
    }
  };

  const confirm = async () => {
    if (loading || !uuid) return;
    if (uploading) {
      Taro.showToast({ title: "头像上传中，请稍候", icon: "none" });
      return;
    }
    setLoading(true);
    setHint(null);
    try {
      const { code } = await Taro.login();
      if (!code) throw new Error("未获取到微信登录凭证");
      const trimmedNickname = nickname.trim().slice(0, NICKNAME_MAX);
      const session = await request<WeappSession>("/api/auth/weapp/confirm-login", {
        method: "POST",
        data: {
          code,
          uuid,
          nickname: trimmedNickname || undefined,
          avatarUrl: avatarUrl || undefined,
        },
        auth: false,
        silent: true,
      });
      saveSession(session);
      Taro.showToast({ title: "认证完成，PC 端即将登录", icon: "success", duration: 2000 });
      setTimeout(() => {
        Taro.navigateBack({
          fail: () => Taro.switchTab({ url: "/pages/index/index" }),
        });
      }, 800);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.code === "login_session_expired"
            ? "二维码已失效，请回到 PC 端刷新后重试"
            : err.message
          : err instanceof Error
            ? err.message
            : "认证失败，请重试";
      setHint(msg);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) });
  };

  // 头像显示源：已上传用 R2 URL；选了但未上传完用本地；都没用默认占位 emoji
  const avatarSrc = avatarUrl ?? avatarLocal;
  const avatarIsPlaceholder = !avatarSrc;

  return (
    <View className="confirm-page">
      <View className="brand-section">
        <View className="logo">
          <Text className="logo-emoji">🍜</Text>
        </View>
        <Text className="brand-name">飨刻</Text>
        <Text className="brand-slogan">确认登录 PC 端</Text>
      </View>

      <View className="action-section">
        <Text className="desc">你在电脑上请求了微信登录，请确认是本人在操作</Text>
        {hint && <Text className="hint">{hint}</Text>}

        {/* 头像选择（微信原生 chooseAvatar） */}
        <View className="avatar-row">
          <Button
            className="avatar-choose-btn"
            openType="chooseAvatar"
            onChooseAvatar={onChooseAvatar}
            disabled={uploading}
          >
            {avatarIsPlaceholder ? (
              <View className="avatar-placeholder">
                <Text className="avatar-placeholder-emoji">👤</Text>
                <Text className="avatar-placeholder-tip">选择头像</Text>
              </View>
            ) : (
              <>
                <Image
                  className="avatar-img"
                  src={avatarSrc!}
                  mode="aspectFill"
                />
                <Text className="avatar-choose-tip">更换头像</Text>
              </>
            )}
          </Button>
          {uploading && <Text className="avatar-uploading-tip">上传中…</Text>}
        </View>

        {/* 昵称（微信原生 nickname 输入，会自动预填微信昵称） */}
        <View className="nickname-row">
          <Text className="nickname-label">昵称</Text>
          <Input
            className="nickname-input"
            type="nickname"
            value={nickname}
            placeholder="点击输入昵称"
            maxlength={NICKNAME_MAX}
            onInput={(e) => setNickname(e.detail.value)}
          />
        </View>

        <Button
          className="btn-confirm"
          loading={loading}
          disabled={loading || !uuid || uploading}
          onClick={() => void confirm()}
        >
          确认登录
        </Button>
        <Button className="btn-cancel" disabled={loading} onClick={goBack}>
          取消
        </Button>
      </View>
    </View>
  );
}