-- ============================================================
-- 飨刻 (XiangKe) - 收藏夹补充坐标列
-- 文件: 019_favorite_places_coords.sql
-- 说明: favorite_places 增加 GCJ-02 坐标与城市列，供「收藏夹一键打卡」使用；
--      坐标由打卡流程经 POI 匹配/地图选点补齐，未补齐时列可空
-- ============================================================

alter table public.favorite_places
  add column if not exists lng numeric(10,6),
  add column if not exists lat numeric(10,6),
  add column if not exists city text;
