-- ============================================================
-- 飨刻 (XiangKe) - 店铺收藏夹联网搜索补齐字段
-- 文件: 008_favorite_places_enrich.sql
-- 说明: 为 favorite_places 增加 cover_image_url / store_url 两列，
--       用于存储通过 MiniMax web_search 服务端工具补齐的封面图与店铺链接。
-- ============================================================

alter table public.favorite_places
  add column if not exists cover_image_url text,
  add column if not exists store_url text;
