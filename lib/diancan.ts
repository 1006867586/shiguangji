import { createServerClient } from "@/lib/supabase/server";

export type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

// ─── 商家档案 / 配对 辅助 ───

/** 返回指定用户的商家档案（非商家返回 null） */
export async function getMerchantOf(
  supabase: SupabaseClient,
  userId: string
) {
  const { data } = await supabase
    .from("merchant_lookup")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** 返回指定顾客当前绑定的商家档案（未绑定返回 null；顾客可能有多个，取最新一条） */
export async function getBoundMerchant(
  supabase: SupabaseClient,
  customerUserId: string
) {
  const { data } = await supabase
    .from("pair_bindings")
    .select("merchant_user_id")
    .eq("customer_user_id", customerUserId)
    .order("paired_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const { data: merchant } = await supabase
    .from("merchant_lookup")
    .select("*")
    .eq("user_id", data.merchant_user_id)
    .maybeSingle();
  return merchant ?? null;
}

/** 返回当前用户在点餐侧的聚合状态 */
export async function getDiancanMe(
  supabase: SupabaseClient,
  userId: string
) {
  const merchant = await getMerchantOf(supabase, userId);
  if (merchant) {
    return {
      role: "merchant",
      merchant: {
        userId,
        pairingCode: merchant.pairing_code,
        shopName: merchant.shop_name,
      },
      pairedCustomer: await getBoundCustomer(supabase, userId),
      notifTemplateId: "",
    };
  }

  const boundMerchant = await getBoundMerchant(supabase, userId);
  if (boundMerchant) {
    return {
      role: "customer",
      merchant: {
        userId: boundMerchant.user_id,
        nickname: boundMerchant.shop_name || "",
        pairingCode: null,
      },
      pairedCustomer: null,
      notifTemplateId: "",
    };
  }

  return { role: null, merchant: null, pairedCustomer: null, notifTemplateId: "" };
}

/** 当前商家绑定的顾客（最新） */
export async function getBoundCustomer(
  supabase: SupabaseClient,
  merchantUserId: string
) {
  const { data } = await supabase
    .from("pair_bindings")
    .select("customer_user_id")
    .eq("merchant_user_id", merchantUserId)
    .order("paired_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.customer_user_id ?? null;
}

/** 判断当前用户是否与该用户存在配对（双向） */
export async function isPaired(
  supabase: SupabaseClient,
  a: string,
  b: string
): Promise<boolean> {
  const { data } = await supabase
    .from("pair_bindings")
    .select("id")
    .or(`and(merchant_user_id.eq.${a},customer_user_id.eq.${b}),and(merchant_user_id.eq.${b},customer_user_id.eq.${a})`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// ─── 配对码生成 ───

const PAIRING_CODE_LENGTH = 6;

/** 生成 6 位不重复数字配对码（受 merchant_lookup.pairing_code unique 约束兜底） */
export function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

// ─── 默认菜单种子（商家首次开店） ───

type SeedCategory = { name: string; dishes: { name: string; emoji: string; price: number; description: string }[] };

/** API Spec §9 的默认菜单：6 分类 + 13 菜 */
const DEFAULT_MENU: SeedCategory[] = [
  {
    name: "炒菜",
    dishes: [
      { name: "番茄炒蛋", emoji: "🍳", price: 18, description: "经典家常" },
      { name: "宫保鸡丁", emoji: "🌶️", price: 28, description: "微辣开胃" },
      { name: "红烧肉", emoji: "🥩", price: 35, description: "肥而不腻" },
    ],
  },
  {
    name: "炖菜",
    dishes: [
      { name: "玉米排骨汤", emoji: "🌽", price: 25, description: "慢炖两小时" },
      { name: "萝卜炖牛腩", emoji: "🥩", price: 38, description: "秋冬暖身" },
    ],
  },
  {
    name: "砂锅菜",
    dishes: [
      { name: "砂锅豆腐", emoji: "🍲", price: 22, description: "下饭神器" },
      { name: "砂锅鸡", emoji: "🍗", price: 42, description: "整鸡入煲" },
    ],
  },
  { name: "日常主食", dishes: [{ name: "馒头", emoji: "🥢", price: 2, description: "论个卖" }] },
  { name: "炒饭", dishes: [{ name: "蛋炒饭", emoji: "🍚", price: 15, description: "镬气十足" }] },
  {
    name: "粉/面食",
    dishes: [
      { name: "牛肉面", emoji: "🍜", price: 22, description: "清汤牛肉" },
      { name: "兰州拉面", emoji: "🍝", price: 20, description: "一清二白三红四绿五黄" },
      { name: "扬州炒饭", emoji: "🍛", price: 18, description: "粒粒分明" },
    ],
  },
];

/** 为商家插入默认菜单（分类 + 菜品，category_id 用真实返回 id） */
export async function seedDefaultMenu(
  supabase: SupabaseClient,
  merchantUserId: string
): Promise<void> {
  for (const cat of DEFAULT_MENU) {
    const { data: catRow } = await supabase
      .from("dish_categories")
      .insert({ merchant_user_id: merchantUserId, name: cat.name, sort: 0 })
      .select("id")
      .single();

    if (!catRow) continue;

    const dishes = cat.dishes.map((d) => ({
      merchant_user_id: merchantUserId,
      category_id: catRow.id,
      name: d.name,
      emoji: d.emoji,
      price: d.price,
      description: d.description,
    }));
    await supabase.from("dishes").insert(dishes);
  }
}