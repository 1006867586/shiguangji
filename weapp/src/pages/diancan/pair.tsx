import { View, Text, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { bindPair, setRole } from "../../utils/diancan";
import "./index.scss";

export default function DiancanPair() {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onBind() {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      Taro.showToast({ title: "请输入 6 位数字配对码", icon: "none" });
      return;
    }
    setSubmitting(true);
    Taro.showLoading({ title: "绑定中...", mask: true });
    try {
      await setRole("customer");
      await bindPair(trimmed);
      Taro.hideLoading();
      Taro.showToast({ title: "绑定成功", icon: "success" });
      setTimeout(() => Taro.switchTab({ url: "/pages/diancan/index" }), 600);
    } catch (err) {
      Taro.hideLoading();
      const msg = errMsg(err).message || "绑定失败，请检查配对码";
      Taro.showToast({ title: msg, icon: "none" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="dc-pair">
      <Text className="dc-pair-title">绑定餐厅</Text>
      <Text className="dc-pair-sub">输入老板提供的 6 位配对码，即可开始点餐</Text>
      <View className="dc-pair-input-wrap">
        <Input
          className="dc-pair-input"
          type="number"
          maxlength={6}
          placeholder="000000"
          value={code}
          onInput={(e) => setCode(e.detail.value)}
        />
      </View>
      <Button
        className="dc-pair-btn"
        loading={submitting}
        disabled={submitting}
        onClick={onBind}
      >
        绑定
      </Button>
    </View>
  );
}

function errMsg(e: unknown): { message?: string } {
  return (e && typeof e === "object" ? (e as { message?: string }) : {}) as {
    message?: string;
  };
}