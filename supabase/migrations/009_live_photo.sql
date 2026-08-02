-- ============================================================
-- 飨刻 (XiangKe) - Live Photo 动态图支持
-- 文件: 009_live_photo.sql
-- 说明: activity_photos 增加 paired_video_url 字段，存储 Live Photo 的动态视频部分
--       一条 Live Photo 记录: kind='image', url=静态图, paired_video_url=动态视频
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'activity_photos' and column_name = 'paired_video_url') then
    alter table public.activity_photos add column paired_video_url text;
    comment on column public.activity_photos.paired_video_url is
      'Live Photo 配对的动态视频 URL（仅 Live Photo 有值，普通图片为 NULL）';
  end if;
end $$;
