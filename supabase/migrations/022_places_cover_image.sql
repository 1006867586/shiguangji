-- ============================================================
-- 飨刻 (XiangKe) - 打卡地点封面图
-- 文件: 022_places_cover_image.sql
-- 说明: places 表增加 cover_image_url 列，存高德 POI photos[0]
-- ============================================================

BEGIN;

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN public.places.cover_image_url IS '店铺封面图 URL（来自高德 POI 详情 photos[0]）';

COMMIT;