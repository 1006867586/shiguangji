import { View, Image, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ActivityPhotoLite } from "@/utils/api";
import "./PhotoGrid.scss";

/**
 * 图片宫格：1 张大图 / 2-3 张一行 / 4+ 九宫格（最多 9），点击全屏预览。
 * onDeletePhoto 提供时单元格右上角显示删除角标；canDeletePhoto 用于按权限
 * 过滤（仅作者或上传者），缺省时全部可删。
 */
export default function PhotoGrid({
  photos,
  onDeletePhoto,
  canDeletePhoto,
}: {
  photos: ActivityPhotoLite[];
  onDeletePhoto?: (photo: ActivityPhotoLite) => void;
  canDeletePhoto?: (photo: ActivityPhotoLite) => boolean;
}) {
  if (!photos.length) return null;

  const urls = photos.map((p) => p.url);

  const preview = (current: string) => {
    Taro.previewImage({ current, urls });
  };

  const deletable = (p: ActivityPhotoLite) =>
    !!onDeletePhoto && (!canDeletePhoto || canDeletePhoto(p));

  // 单图：限制最大宽度，保留原始比例展示
  if (photos.length === 1) {
    return (
      <View className="photo-grid single" onClick={() => preview(urls[0])}>
        <Image
          className="photo-single"
          src={urls[0]}
          mode="aspectFill"
          lazyLoad
        />
        {deletable(photos[0]) && (
          <View className="photo-del" onClick={(e) => { e.stopPropagation(); onDeletePhoto!(photos[0]); }}>
            <Text className="photo-del-x">×</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className={`photo-grid grid-${Math.min(photos.length, 3)}`}>
      {photos.slice(0, 9).map((p) => (
        <View
          key={p.id}
          className="photo-cell"
          onClick={() => preview(p.url)}
        >
          <Image className="photo-img" src={p.url} mode="aspectFill" lazyLoad />
          {photos.length > 9 && null}
          {deletable(p) && (
            <View
              className="photo-del"
              onClick={(e) => {
                e.stopPropagation();
                onDeletePhoto!(p);
              }}
            >
              <Text className="photo-del-x">×</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
