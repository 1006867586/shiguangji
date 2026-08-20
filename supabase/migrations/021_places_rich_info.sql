-- ============================================================
-- 飨刻 (XiangKe) - 打卡地点扩展信息
-- 文件: 021_places_rich_info.sql
-- 说明: places 表增加评分/人均/电话/营业时间/描述/标签等富文本字段，
--      入库时由高德 POI 详情接口一并写入，浮层卡片展示更完整。
-- ============================================================

BEGIN;

-- 富文本字段
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS rating           numeric(2, 1)
    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  ADD COLUMN IF NOT EXISTS average_price    text,            -- 人均消费字符串（"￥65"）
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS business_hours   text,            -- 营业时间字符串（"周一至周日 10:00-22:00"）
  ADD COLUMN IF NOT EXISTS description      text,            -- 描述/简介
  ADD COLUMN IF NOT EXISTS tags              text[]           -- 标签数组（如 ["火锅","聚餐"]）
  ;

-- updated_at 列（touch 时自动更新）
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 自动维护 updated_at 的触发器
DROP TRIGGER IF EXISTS trg_places_updated_at ON public.places;
CREATE TRIGGER trg_places_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- 评分索引：找"评分最高的店"
CREATE INDEX IF NOT EXISTS idx_places_rating
  ON public.places(rating DESC NULLS LAST)
  WHERE rating IS NOT NULL;

-- 标签 GIN 索引：按标签筛（如"火锅"）
CREATE INDEX IF NOT EXISTS idx_places_tags
  ON public.places USING gin(tags)
  WHERE tags IS NOT NULL;

COMMENT ON COLUMN public.places.rating IS '评分 0-5（来自高德 POI 详情）';
COMMENT ON COLUMN public.places.average_price IS '人均消费（来自高德 POI 详情，字符串）';
COMMENT ON COLUMN public.places.phone IS '联系电话';
COMMENT ON COLUMN public.places.business_hours IS '营业时间';
COMMENT ON COLUMN public.places.description IS '店铺简介/备注';
COMMENT ON COLUMN public.places.tags IS '特色标签数组';

COMMIT;