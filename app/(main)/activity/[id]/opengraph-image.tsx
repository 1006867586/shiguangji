import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOGFonts } from "@/lib/og-font";
import { APP_NAME } from "@/lib/constants";

// OG 图片需要在 edge runtime 运行（createAdminClient 使用 @supabase/supabase-js，edge 兼容）
export const runtime = "edge";
export const alt = `${APP_NAME} - 活动详情`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Params = { params: Promise<{ id: string }> };

export default async function ActivityOGImage({ params }: Params) {
  const { id } = await params;

  // 默认值（数据获取失败时的回退卡片）
  let title = "分享了一条聚餐记录";
  let author = "";
  let groupName = "";
  let timeText = "";

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("activities")
      .select(
        "content, created_at, author:profiles!activities_author_id_fkey(nickname), group:groups(name)"
      )
      .eq("id", id)
      .maybeSingle();

    if (data) {
      const content = (data.content as string | null) ?? "";
      title = content.slice(0, 60) || title;
      const authorRow = data.author as { nickname?: string } | null;
      author = authorRow?.nickname ?? "";
      const groupRow = data.group as { name?: string } | null;
      groupName = groupRow?.name ?? "";
      const createdAt = data.created_at as string | null;
      if (createdAt) {
        timeText = new Date(createdAt).toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
    }
  } catch (err) {
    // 环境变量缺失或查询失败：使用默认卡片
    console.error("[OG] activity 数据获取失败:", err);
  }

  const fonts = await getOGFonts();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 60%, #fed7aa 100%)",
          padding: "64px",
          fontFamily: "NotoSansSC",
        }}
      >
        {/* 顶部品牌区 */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "#f97316",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            飨
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "30px",
              fontWeight: 700,
              color: "#f97316",
            }}
          >
            {APP_NAME}
          </div>
          {groupName ? (
            <div
              style={{
                display: "flex",
                marginLeft: "auto",
                fontSize: "26px",
                color: "#71717a",
              }}
            >
              {groupName}
            </div>
          ) : null}
        </div>

        {/* 内容区 */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            fontSize: title.length > 30 ? "44px" : "56px",
            fontWeight: 600,
            color: "#18181b",
            lineHeight: 1.4,
          }}
        >
          {title}
        </div>

        {/* 底部信息区 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            fontSize: "26px",
            color: "#52525b",
          }}
        >
          {author ? (
            <div style={{ display: "flex", fontWeight: 500 }}>@{author}</div>
          ) : null}
          {timeText ? <div style={{ display: "flex" }}>{timeText}</div> : null}
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
