-- ============================================================
-- 飨刻 (XiangKe) - 收藏夹支持高德平台
-- 文件: 025_favorite_places_amap.sql
-- 说明: 高德地图「我的收藏」截图导入；扩展 favorite_places.platform CHECK 约束
-- ============================================================

alter table public.favorite_places
  drop constraint if exists favorite_places_platform_check;

alter table public.favorite_places
  add constraint favorite_places_platform_check check (platform in (
    'meituan', 'dianping', 'xiaohongshu', 'douyin', 'amap', 'unknown'
  ));
