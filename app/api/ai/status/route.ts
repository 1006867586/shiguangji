import { jsonResponse } from "@/lib/utils";
import { isAiConfigured } from "@/lib/ai/minimax";

export const dynamic = "force-dynamic";

/**
 * 返回 AI 功能是否启用。
 * 前端据此决定是否显示「AI 截图识别」「AI 文案生成」等入口按钮。
 * 此接口无需登录（仅返回布尔值，不泄露密钥）。
 */
export async function GET() {
  return jsonResponse({ data: { enabled: isAiConfigured() } });
}
