import { View, Text, Input, Button, Switch } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import {
  fetchDiancanMe,
  fetchMenu,
  createCategory,
  deleteCategory,
  createDish,
  updateDish,
  deleteDish,
  type Dish,
  type DishCategory,
} from "../../utils/diancan";
import "./index.scss";

/**
 * 配菜页：商家管理分类与菜品（新增/编辑/上下架/删除）。
 */
export default function DiancanManage() {
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 新增分类
  const [newCat, setNewCat] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  // 菜品编辑面板：mode=create 新增，mode=edit 编辑
  const [editing, setEditing] = useState<{ mode: "create" | "edit"; dish: Dish | null } | null>(null);
  const [form, setForm] = useState({ name: "", emoji: "", price: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const m = await fetchDiancanMe();
      if (m.role !== "merchant") {
        setMerchantId(null);
        return;
      }
      setMerchantId(m.merchant.userId);
      const menu = await fetchMenu(m.merchant.userId);
      setCategories(menu.categories);
      setDishes(menu.dishes);
      setActiveCat((cur) =>
        cur && menu.categories.some((c) => c.id === cur) ? cur : (menu.categories[0]?.id ?? null)
      );
    } catch {
      // 401 已在 request 层处理
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useDidShow(() => {
    load();
  });

  const activeDishes = useMemo(
    () => dishes.filter((d) => d.category_id === activeCat),
    [dishes, activeCat]
  );

  async function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    setAddingCat(true);
    try {
      const { category } = await createCategory(name);
      setNewCat("");
      setActiveCat(category.id);
      await load();
    } catch {
      // 错误 toast 已弹出
    } finally {
      setAddingCat(false);
    }
  }

  async function removeCategory(cat: DishCategory) {
    const res = await Taro.showModal({
      title: "删除分类",
      content: `删除「${cat.name}」？（分类下有菜时需先删除菜品）`,
      confirmColor: "#ff6b35",
    });
    if (!res.confirm) return;
    try {
      await deleteCategory(cat.id);
      if (activeCat === cat.id) setActiveCat(null);
      await load();
    } catch {
      // 409 等错误 toast 已弹出
    }
  }

  async function toggleDish(dish: Dish) {
    try {
      await updateDish(dish.id, { available: !dish.available });
      await load();
    } catch {
      // 错误 toast 已弹出
    }
  }

  async function removeDish(dish: Dish) {
    const res = await Taro.showModal({
      title: "删除菜品",
      content: `确定删除「${dish.emoji} ${dish.name}」吗？`,
      confirmColor: "#ff6b35",
    });
    if (!res.confirm) return;
    try {
      await deleteDish(dish.id);
      await load();
    } catch {
      // 错误 toast 已弹出
    }
  }

  function openCreate() {
    setForm({ name: "", emoji: "🍽️", price: "", description: "" });
    setEditing({ mode: "create", dish: null });
  }

  function openEdit(dish: Dish) {
    setForm({
      name: dish.name,
      emoji: dish.emoji || "🍽️",
      price: String(Number(dish.price)),
      description: dish.description || "",
    });
    setEditing({ mode: "edit", dish });
  }

  async function submitDish() {
    if (!editing) return;
    if (!form.name.trim()) {
      Taro.showToast({ title: "请输入菜名", icon: "none" });
      return;
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      Taro.showToast({ title: "价格不合法", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        emoji: form.emoji.trim() || "🍽️",
        price,
        description: form.description.trim(),
      };
      if (editing.mode === "create") {
        if (!activeCat) {
          Taro.showToast({ title: "请先新增分类", icon: "none" });
          return;
        }
        await createDish({ ...payload, categoryId: activeCat });
      } else if (editing.dish) {
        await updateDish(editing.dish.id, payload);
      }
      setEditing(null);
      await load();
    } catch {
      // 错误 toast 已弹出
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View className="dc-empty">
        <Text>加载中…</Text>
      </View>
    );
  }

  if (!merchantId) {
    return (
      <View className="dc-empty">
        <View className="dc-empty-icon">👨‍🍳</View>
        <Text className="dc-empty-title">只有商家可以配菜</Text>
        <Text className="dc-empty-sub">请先在商家中心完成开店</Text>
        <View className="dc-btn" onClick={() => Taro.navigateTo({ url: "/pages/diancan/shop" })}>
          去开店
        </View>
      </View>
    );
  }

  return (
    <View className="dc-page">
      <View className="dc-shop-header">
        <View className="dc-shop-info">
          <Text className="dc-shop-name">配菜</Text>
          <Text className="dc-shop-tagline">管理分类与菜品</Text>
        </View>
        <Button className="dc-shop-save" onClick={openCreate}>
          ＋ 新菜
        </Button>
      </View>

      {/* 分类 chips */}
      <View className="dc-cat-bar">
        <ScrollViewX categories={categories} activeCat={activeCat} onPick={setActiveCat} onRemove={removeCategory} />
        <View className="dc-cat-add">
          <Input
            className="dc-cat-add-input"
            value={newCat}
            placeholder="新分类名"
            onInput={(e) => setNewCat(e.detail.value)}
          />
          <Button className="dc-cat-add-btn" loading={addingCat} disabled={addingCat} onClick={addCategory}>
            添加
          </Button>
        </View>
      </View>

      {/* 菜品列表 */}
      <View className="dc-manage-list">
        {activeDishes.length === 0 ? (
          <View className="dc-order-empty">
            {categories.length === 0 ? "先添加一个分类" : "该分类暂无菜品，点右上角新增"}
          </View>
        ) : (
          activeDishes.map((d) => (
            <View key={d.id} className="dc-manage-row">
              <View className="dc-dish-emoji dc-manage-emoji">{d.emoji || "🍽️"}</View>
              <View className="dc-dish-body">
                <Text className="dc-dish-name">{d.name}</Text>
                <Text className="dc-dish-price">¥{Number(d.price).toFixed(2)}</Text>
              </View>
              <View className="dc-manage-ops">
                <Switch
                  className="dc-manage-switch"
                  checked={d.available !== false}
                  color="#ff6b35"
                  onChange={() => toggleDish(d)}
                />
                <View className="dc-manage-edit" onClick={() => openEdit(d)}>
                  编辑
                </View>
                <View className="dc-manage-del" onClick={() => removeDish(d)}>
                  删除
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* 菜品编辑面板 */}
      {editing ? (
        <View className="dc-mask" onClick={() => !saving && setEditing(null)}>
          <View className="dc-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="dc-sheet-title">
              {editing.mode === "create" ? "新增菜品" : "编辑菜品"}
            </Text>
            <View className="dc-field">
              <Text className="dc-field-label">菜名</Text>
              <Input
                className="dc-field-input"
                value={form.name}
                maxlength={64}
                placeholder="如：番茄炒蛋"
                onInput={(e) => setForm((f) => ({ ...f, name: e.detail.value }))}
              />
            </View>
            <View className="dc-field">
              <Text className="dc-field-label">Emoji</Text>
              <Input
                className="dc-field-input"
                value={form.emoji}
                maxlength={8}
                placeholder="🍽️"
                onInput={(e) => setForm((f) => ({ ...f, emoji: e.detail.value }))}
              />
            </View>
            <View className="dc-field">
              <Text className="dc-field-label">价格</Text>
              <Input
                className="dc-field-input"
                type="digit"
                value={form.price}
                placeholder="如：28"
                onInput={(e) => setForm((f) => ({ ...f, price: e.detail.value }))}
              />
            </View>
            <View className="dc-field">
              <Text className="dc-field-label">描述</Text>
              <Input
                className="dc-field-input"
                value={form.description}
                maxlength={100}
                placeholder="可选"
                onInput={(e) => setForm((f) => ({ ...f, description: e.detail.value }))}
              />
            </View>
            <Button className="dc-pair-btn" loading={saving} disabled={saving} onClick={submitDish}>
              保存
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** 分类 chips（横向滚动） */
function ScrollViewX({
  categories,
  activeCat,
  onPick,
  onRemove,
}: {
  categories: DishCategory[];
  activeCat: string | null;
  onPick: (id: string) => void;
  onRemove: (cat: DishCategory) => void;
}) {
  return (
    <View className="dc-cat-scroll">
      {categories.map((c) => (
        <View
          key={c.id}
          className={`dc-cat-chip ${activeCat === c.id ? "dc-cat-chip-on" : ""}`}
          onClick={() => onPick(c.id)}
        >
          <Text>{c.name}</Text>
          <Text className="dc-cat-chip-x" onClick={(e) => { e.stopPropagation(); onRemove(c); }}>
            ×
          </Text>
        </View>
      ))}
    </View>
  );
}
