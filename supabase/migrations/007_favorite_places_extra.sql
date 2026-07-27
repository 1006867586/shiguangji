-- ============================================================
-- 飨刻 (XiangKe) - 店铺收藏夹字段扩展
-- 文件: 007_favorite_places_extra.sql
-- 说明: 为 favorite_places 增加 category/rating/price 三列，
--       与 AI 截图识别（parse-favorites-screenshot）保持一致。
-- ============================================================

alter table public.favorite_places
  add column if not exists category text,
  add column if not exists rating numeric(2,1),
  add column if not exists price text;
