import { View, Text } from "@tarojs/components";

export default function PublishPage() {
  return (
    <View className="page">
      <View className="card">
        <Text className="title">发布饭局</Text>
        <Text className="text-muted">
          Phase 2 实现：文字 + 图片上传（R2 presign 直传）+ 链接解析 + 发起活动。
        </Text>
      </View>
    </View>
  );
}
