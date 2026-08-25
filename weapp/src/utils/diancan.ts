import Taro from "@tarojs/taro";
import { request } from "./request";

/**
 * 点餐模块 API 客户端（diancan 原生小程序合并进来的 Taro 重写版）。
 *
 * - 复用我们的 request.ts（Bearer 认证 + { data }/{ error } 信封 + 401 自动登出）
 * - 后端一律用 UUID（merchant_user_id / customer_user_id），
 *   取代原 diancan 的 merchantOpenid 会话概念
 * - 餐厅协作/角色配对见 /api/diancan/me、/api/diancan/pair/*
 */

// ---- 类型 ----

export type DiancanRole = "merchant" | "customer" | null;

export interface DiancanMe {
  role: DiancanRole;
  merchant: {
    userId: string;
    shopName?: string;
    pairingCode?: string | null;
    nickname?: string;
    logoUrl?: string | null;
  } | null;
  pairedCustomer: string | null;
  notifTemplateId: string;
}

/** merchant_lookup 行 ⇄ 店铺档案 */
export interface MerchantProfile {
  id: string;
  user_id: string;
  pairing_code: string | null;
  shop_name: string;
  tagline: string;
  notice: string;
  theme_color: "red" | "orange" | "blue";
  logo_url: string | null;
  updated_at: string;
}

export interface DishCategory {
  id: string;
  merchant_user_id: string;
  name: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface Dish {
  id: string;
  merchant_user_id: string;
  category_id: string | null;
  name: string;
  emoji: string;
  description: string;
  price: number;
  available: boolean;
  thumbnail_url: string | null;
  linked_recipe_id: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = "pending" | "accepted" | "rejected" | "completed";

export interface OrderItem {
  dishId: string;
  name: string;
  price: number;
  emoji: string;
  qty: number;
}

export interface Order {
  id: string;
  customer_user_id: string;
  merchant_user_id: string;
  customer_nickname: string;
  merchant_nickname: string;
  items_json: OrderItem[];
  total_price: number;
  status: OrderStatus;
  invite_note: string | null;
  created_at: string;
  updated_at: string;
}

/** 本地购物车项（单店态：一页只展示/下单同一家店） */
export interface CartItem {
  dishId: string;
  merchantUserId: string;
  merchantNickname: string;
  name: string;
  emoji: string;
  price: number;
  qty: number;
}

export interface ShopConfig {
  id: string;
  user_id: string;
  shop_name: string;
  tagline: string;
  notice: string;
  theme_color: string;
  logo_url: string | null;
}

// ---- 存储 key ----
export const DC_CART_KEY = "dc_cart_items";
export const DC_LAST_MERCHANT_KEY = "dc_last_merchant_user_id";

export function loadCart(): CartItem[] {
  try {
    return (Taro.getStorageSync(DC_CART_KEY) || []) as CartItem[];
  } catch {
    return [];
  }
}
function saveCart(items: CartItem[]) {
  Taro.setStorageSync(DC_CART_KEY, items);
}

// ---- 基础 ----

/** 我当前在点餐侧的角色与上下文 */
export function fetchDiancanMe(): Promise<DiancanMe> {
  return request<DiancanMe>("/api/diancan/me", { silent: true });
}

export function setRole(role: "customer" | "merchant"): Promise<DiancanMe> {
  return request("/api/diancan/me/role", { method: "POST", data: { role } });
}

// ---- 配对 ----

export function generatePairCode(): Promise<{ code: string }> {
  return request("/api/diancan/pair/code", { method: "POST" });
}

export function bindPair(code: string): Promise<MerchantProfile & { merchantUserId: string }> {
  return request("/api/diancan/pair/bind", { method: "POST", data: { code } });
}

export function unbindPair(): Promise<unknown> {
  return request("/api/diancan/pair", { method: "DELETE" });
}

// ---- 菜单（分类 + 菜品）----

export function fetchMenu(merchantUserId: string): Promise<{
  categories: DishCategory[];
  dishes: Dish[];
}> {
  const q = `merchantUserId=${encodeURIComponent(merchantUserId)}`;
  return request(`/api/diancan/categories?${q}`).then((categories) =>
    request(`/api/diancan/dishes?${q}`).then(
      (dishes) => ({ categories: categories as DishCategory[], dishes: dishes as Dish[] })
    )
  );
}

export function fetchShopConfig(merchantUserId: string): Promise<ShopConfig> {
  return request(`/api/diancan/shop?merchantUserId=${encodeURIComponent(merchantUserId)}`, {
    silent: true,
  });
}

// ---- 订单 ----

export function createOrder(body: {
  merchantUserId: string;
  items: Array<{ dishId: string; qty: number }>;
  inviteNote?: string;
}): Promise<{ order: Order }> {
  return request("/api/diancan/orders", {
    method: "POST",
    data: { merchantUserId, items, inviteNote },
  });
}

/** 商家视角订单列表 */
export function fetchMerchantOrders(): Promise<{ orders: Order[] }> {
  return request("/api/diancan/orders", { silent: true });
}

/** 顾客视角订单列表 */
export function fetchCustomerOrders(): Promise<{ orders: Order[] }> {
  return request("/api/diancan/orders", { silent: true });
}

export function fetchOrder(id: string): Promise<{ order: Order }> {
  return request(`/api/diancan/orders/${id}`, { silent: true });
}

export function updateOrderStatus(id: string, status: OrderStatus): Promise<unknown> {
  return request(`/api/diancan/orders/${id}/status`, { method: "PUT", data: { status } });
}

// ---- 购物车工具（单店态）----

/** 加菜：若来自不同店则清空旧车 */
export function addToCart(merchant: { userId: string; shopName: string }, dish: Dish, qty = 1): CartItem[] {
  const all = loadCart();
  const others = all.filter((it) => it.dishId === dish.id);
  if (others.length > 0) {
    others[0].qty += qty;
  } else {
    all.push({
      dishId: dish.id,
      merchantUserId: merchant.userId,
      merchantNickname: merchant.shopName,
      name: dish.name,
      emoji: dish.emoji,
      price: Number(dish.price),
      qty,
    });
  }
  // 单店态：只保留目标店（跨店加车视为换店）
  const filtered = all.filter((it) => it.merchantUserId === merchant.userId);
  saveCart(filtered);
  Taro.setStorageSync(DC_LAST_MERCHANT_KEY, merchant.userId);
  return filtered;
}

export function updateCartQty(dishId: string, delta: number): CartItem[] {
  const all = loadCart();
  const idx = all.findIndex((it) => it.dishId === dishId);
  if (idx === -1) return all;
  all[idx].qty += delta;
  if (all[idx].qty <= 0) all.splice(idx, 1);
  saveCart(all);
  return all;
}

export function clearCartForMerchant(merchantUserId: string): CartItem[] {
  const remaining = loadCart().filter((it) => it.merchantUserId !== merchantUserId);
  saveCart(remaining);
  return remaining;
}

export function cartTotal(items: CartItem[]): string {
  return items.reduce((s, it) => s + it.price * it.qty, 0).toFixed(2);
}

// ---- 店铺配置（商家）----

/** /api/diancan/shop GET 返回的店铺配置（含配对码） */
export interface MyShopConfig {
  merchantUserId: string;
  shopName: string;
  displayShopName: string;
  tagline: string;
  notice: string;
  themeColor: string;
  themeColorHex: string;
  logoUrl: string | null;
  pairingCode: string | null;
  updatedAt: string;
}

export function fetchMyShop(merchantUserId: string): Promise<{
  config: MyShopConfig;
  banners: unknown[];
}> {
  return request(`/api/diancan/shop?merchantUserId=${encodeURIComponent(merchantUserId)}`, {
    silent: true,
  });
}

export function updateShopConfig(patch: {
  shopName?: string;
  tagline?: string;
  notice?: string;
  themeColor?: string;
  logoUrl?: string | null;
}): Promise<{ config: MyShopConfig }> {
  return request("/api/diancan/shop", { method: "PUT", data: patch });
}

// ---- 菜单管理（商家）----

export function createCategory(name: string, sort = 0): Promise<{ category: DishCategory }> {
  return request("/api/diancan/categories", { method: "POST", data: { name, sort } });
}

export function deleteCategory(id: string): Promise<void> {
  return request(`/api/diancan/categories/${id}`, { method: "DELETE" });
}

export function createDish(body: {
  name: string;
  categoryId: string;
  description?: string;
  emoji?: string;
  price: number;
  available?: boolean;
  thumbnailUrl?: string;
}): Promise<{ dish: Dish }> {
  return request("/api/diancan/dishes", { method: "POST", data: body });
}

export function updateDish(
  id: string,
  patch: {
    name?: string;
    description?: string;
    emoji?: string;
    price?: number;
    categoryId?: string;
    available?: boolean;
    thumbnailUrl?: string;
  }
): Promise<{ dish: Dish }> {
  return request(`/api/diancan/dishes/${id}`, { method: "PUT", data: patch });
}

export function deleteDish(id: string): Promise<void> {
  return request(`/api/diancan/dishes/${id}`, { method: "DELETE" });
}