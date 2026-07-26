import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOGFonts } from "@/lib/og-font";
import { APP_NAME } from "@/lib/constants";

// OG 图片需要在 edge runtime 运行
export const runtime = "edge";
export const alt = `${APP_NAME} - 团体`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Params = { params: Promise<{ groupId: string }> };

export default async function GroupOGImage({ params }: Params) {
  const { groupId } = await params;

  // 默认值
  let groupName = "飨刻团体";
  let description = "";
  let memberCount = 0;

  try {
    const supabase = createAdminClient();

    // 并行获取团体信息与成员数
    const [groupRes, countRes] = await Promise.all([
      supabase
        .from("groups")
        .select("name, description")
        .eq("id", groupId)
        .maybeSingle(),
      supabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId),
    ]);

    if (groupRes.data) {
      groupName = (groupRes.data.name as string) || groupName;
      description = (groupRes.data.description as string | null) ?? "";
    }
    memberCount = countRes.count ?? 0;
  } catch (err) {
    // 环境变量缺失或查询失败：使用默认卡片
    console.error("[OG] group 数据获取失败:", err);
  }

  const fonts = await getOGFonts();

  // 描述截断，避免 OG 卡片溢出
  const shortDesc = description ? description.slice(0, 50) : "";

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
        </div>

        {/* 团体名 */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "64px",
              fontWeight: 700,
              color: "#18181b",
              lineHeight: 1.3,
            }}
          >
            {groupName}
          </div>
          {shortDesc ? (
            <div
              style={{
                display: "flex",
                fontSize: "28px",
                color: "#52525b",
                lineHeight: 1.5,
              }}
            >
              {shortDesc}
            </div>
          ) : null}
        </div>

        {/* 底部信息区 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "26px",
            color: "#71717a",
          }}
        >
          <div style={{ display: "flex", fontWeight: 500, color: "#f97316" }}>
            {memberCount} 位成员
          </div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>邀请你加入团体</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
