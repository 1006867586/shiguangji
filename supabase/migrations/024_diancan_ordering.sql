-- ============================================================
-- 飨刻 (XiangKe) - 点餐模块数据库迁移
-- 文件: 024_diancan_ordering.sql
-- 说明: 从「吃啥请点餐」点餐系统合入的表结构 + RLS + Realtime
-- 身份映射：diancan 的 users(openid) 统一用 auth.users 的 uuid；
-- 商家档案/配对从本迁移独立拆分，不复用 profiles（避免污染社交资料）。
-- ============================================================

-- ============================================================
-- 1. 表结构
-- ============================================================

-- 商家档案 + 店铺装修 + 配对码（商家一行）
create table if not exists public.merchant_lookup (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid unique not null references auth.users on delete cascade,
  pairing_code varchar(6) unique,
  shop_name text not null default '',
  tagline text not null default '',
  notice text not null default '',
  theme_color text not null default 'orange' check (theme_color in ('red', 'orange', 'blue')),
  logo_url text,
  updated_at timestamptz default now()
);

-- 商家【顾客绑定关系（一对一：一个商家绑定一个当前顾客）
create table if not exists public.pair_bindings (
  id uuid default uuid_generate_v4() primary key,
  merchant_user_id uuid not null references auth.users on delete cascade,
  customer_user_id uuid unique not null references auth.users on delete cascade,
  paired_at timestamptz default now(),
  unique (merchant_user_id, customer_user_id)
);

-- 菜单分类
create table if not exists public.dish_categories (
  id uuid default uuid_generate_v4() primary key,
  merchant_user_id uuid not null references auth.users on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 菜品
create table if not exists public.dishes (
  id uuid default uuid_generate_v4() primary key,
  merchant_user_id uuid not null references auth.users on delete cascade,
  category_id uuid references public.dish_categories on delete restrict,
  name text not null,
  emoji text not null default '🍽️',
  description text not null default '',
  price numeric(8,2) not null default 0,
  available boolean not null default true,
  thumbnail_url text,
  linked_recipe_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 订单（items 快照菜品名/价/emoji/数量；昵称快照便于历史显示）
create table if not exists public.orders (
  id uuid default uuid_generate_v4() primary key,
  customer_user_id uuid not null references auth.users on delete cascade,
  merchant_user_id uuid not null references auth.users on delete cascade,
  customer_nickname text not null default '',
  merchant_nickname text not null default '',
  items_json jsonb not null default '[]',
  total_price numeric(10,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'completed')),
  invite_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 店铺轮播图
create table if not exists public.shop_banners (
  id uuid default uuid_generate_v4() primary key,
  merchant_user_id uuid not null references auth.users on delete cascade,
  image_url text not null,
  sort int not null default 0,
  created_at timestamptz default now()
);

-- 菜谱本
create table if not exists public.recipes (
  id uuid default uuid_generate_v4() primary key,
  merchant_user_id uuid not null references auth.users on delete cascade,
  title text not null,
  linked_dish_id uuid references public.dishes on delete set null,
  current_version int not null default 1,
  published_version int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 菜谱版本
create table if not exists public.recipe_versions (
  id uuid default uuid_generate_v4() primary key,
  recipe_id uuid not null references public.recipes on delete cascade,
  version int not null,
  name text,
  memo text not null default '',
  ingredients_json jsonb not null default '[]',
  steps_json jsonb not null default '{"nodes":[]}',
  total_time_min int,
  notes text not null default '',
  created_at timestamptz default now(),
  unique (recipe_id, version)
);

-- dishes.linked_recipe_id 外键（recipes 已建，放这里引用）
alter table public.dishes
  drop constraint if exists dishes_linked_recipe_fk;
alter table public.dishes
  add constraint dishes_linked_recipe_fk foreign key (linked_recipe_id)
  references public.recipes(id) on delete set null;

-- 订阅消息授权
create table if not exists public.notification_subscriptions (
  user_id uuid not null references auth.users on delete cascade,
  template_id text not null,
  status text not null default 'accepted' check (status in ('accepted', 'rejected', 'expired')),
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz,
  primary key (user_id, template_id)
);

-- 推送日志（发布真实推送前默认 MOCK 记录）
create table if not exists public.notifications_sent (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users on delete cascade,
  template_id text not null,
  order_id uuid references public.orders on delete set null,
  payload_json jsonb not null default '{}',
  mode text not null default 'MOCK' check (mode in ('MOCK', 'REAL')),
  status text not null default 'mocked' check (status in ('mocked', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz default now()
);

-- ============================================================
-- 2. 索引
-- ============================================================
create index if not exists idx_merchant_lookup_user on public.merchant_lookup(user_id);
create index if not exists idx_merchant_lookup_pairing on public.merchant_lookup(pairing_code);
create index if not exists idx_pair_bindings_merchant on public.pair_bindings(merchant_user_id);
create index if not exists idx_pair_bindings_customer on public.pair_bindings(customer_user_id);
create index if not exists idx_dish_categories_merchant on public.dish_categories(merchant_user_id, sort);
create index if not exists idx_dishes_merchant_cat on public.dishes(merchant_user_id, category_id);
create index if not exists idx_dishes_linked_recipe on public.dishes(linked_recipe_id);
create index if not exists idx_orders_customer on public.orders(customer_user_id, created_at desc);
create index if not exists idx_orders_merchant on public.orders(merchant_user_id, created_at desc);
create index if not exists idx_shop_banners_merchant on public.shop_banners(merchant_user_id, sort);
create index if not exists idx_recipes_merchant on public.recipes(merchant_user_id);
create index if not exists idx_recipe_versions_recipe on public.recipe_versions(recipe_id, version);

-- ============================================================
-- 3. updated_at 自动更新触发器
-- ============================================================
drop trigger if exists trg_merchant_lookup_touch on public.merchant_lookup;
create trigger trg_merchant_lookup_touch
  before update on public.merchant_lookup
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_dish_categories_touch on public.dish_categories;
create trigger trg_dish_categories_touch
  before update on public.dish_categories
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_dishes_touch on public.dishes;
create trigger trg_dishes_touch
  before update on public.dishes
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_recipes_touch on public.recipes;
create trigger trg_recipes_touch
  before update on public.recipes
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 4. 权限辅助函数（security definer，绕过 RLS 递归）
-- ============================================================

-- 当前用户是否已是商家
create or replace function public.is_merchant()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.merchant_lookup where user_id = auth.uid()
  );
$$;
grant execute on function public.is_merchant() to authenticated, anon;

-- 当前用户与 p_user 是否存在配对（任意方向）
create or replace function public.is_paired_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pair_bindings b
    where (b.merchant_user_id = auth.uid() and b.customer_user_id = p_user)
       or (b.merchant_user_id = p_user and b.customer_user_id = auth.uid())
  );
$$;
grant execute on function public.is_paired_with(uuid) to authenticated, anon;

-- 当前用户是否可查看某商家菜单（自己 = 商家，或与之配对）
create or replace function public.is_merchant_viewer(p_merchant_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (auth.uid() = p_merchant_user or public.is_paired_with(p_merchant_user));
$$;
grant execute on function public.is_merchant_viewer(uuid) to authenticated, anon;

-- 判断配对码对这个商家是否可用（未绑定其他顾客时置空以复用）
create or replace function public.is_pairing_code_free(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_code is not null
     and not exists (select 1 from public.merchant_lookup where pairing_code = p_code);
$$;
grant execute on function public.is_pairing_code_free(text) to authenticated, anon;

-- ============================================================
-- 5. Row Level Security
-- ============================================================
alter table public.merchant_lookup enable row level security;
alter table public.pair_bindings enable row level security;
alter table public.dish_categories enable row level security;
alter table public.dishes enable row level security;
alter table public.orders enable row level security;
alter table public.shop_banners enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.notification_subscriptions enable row level security;
alter table public.notifications_sent enable row level security;

-- merchant_lookup
drop policy if exists "Merchant profile viewable by owner or paired" on public.merchant_lookup;
create policy "Merchant profile viewable by owner or paired"
  on public.merchant_lookup for select
  using (public.is_merchant_viewer(merchant_lookup.user_id));

drop policy if exists "Merchant can create own profile" on public.merchant_lookup;
create policy "Merchant can create own profile"
  on public.merchant_lookup for insert
  with check (user_id = auth.uid());

drop policy if exists "Merchant can update own profile" on public.merchant_lookup;
create policy "Merchant can update own profile"
  on public.merchant_lookup for update
  using (user_id = auth.uid());

-- pair_bindings
drop policy if exists "Bindings viewable by both parties" on public.pair_bindings;
create policy "Bindings viewable by both parties"
  on public.pair_bindings for select
  using (public.is_paired_with(
    case when merchant_user_id = auth.uid() then customer_user_id else merchant_user_id end
  ));

drop policy if exists "Customer can create binding" on public.pair_bindings;
create policy "Customer can create binding"
  on public.pair_bindings for insert
  with check (customer_user_id = auth.uid());

drop policy if exists "Either party can delete binding" on public.pair_bindings;
create policy "Either party can delete binding"
  on public.pair_bindings for delete
  using (
    case when merchant_user_id = auth.uid() then true
         when customer_user_id = auth.uid() then true
         else false end
  );

-- dish_categories / dishes（商家写，配对可读）
drop policy if exists "Categories viewable by merchant or paired" on public.dish_categories;
create policy "Categories viewable by merchant or paired"
  on public.dish_categories for select
  using (public.is_merchant_viewer(dish_categories.merchant_user_id));

drop policy if exists "Merchant can insert categories" on public.dish_categories;
create policy "Merchant can insert categories"
  on public.dish_categories for insert
  with check (merchant_user_id = auth.uid() and public.is_merchant());

drop policy if exists "Merchant can update categories" on public.dish_categories;
create policy "Merchant can update categories"
  on public.dish_categories for update
  using (merchant_user_id = auth.uid());

drop policy if exists "Merchant can delete categories" on public.dish_categories;
create policy "Merchant can delete categories"
  on public.dish_categories for delete
  using (merchant_user_id = auth.uid());

drop policy if exists "Dishes viewable by merchant or paired" on public.dishes;
create policy "Dishes viewable by merchant or paired"
  on public.dishes for select
  using (public.is_merchant_viewer(dishes.merchant_user_id));

drop policy if exists "Merchant can insert dishes" on public.dishes;
create policy "Merchant can insert dishes"
  on public.dishes for insert
  with check (merchant_user_id = auth.uid() and public.is_merchant());

drop policy if exists "Merchant can update dishes" on public.dishes;
create policy "Merchant can update dishes"
  on public.dishes for update
  using (merchant_user_id = auth.uid());

drop policy if exists "Merchant can delete dishes" on public.dishes;
create policy "Merchant can delete dishes"
  on public.dishes for delete
  using (merchant_user_id = auth.uid());

-- orders（双方可见；顾客创建；商家/顾客更新——状态机放 route 校验）
drop policy if exists "Orders viewable by both parties" on public.orders;
create policy "Orders viewable by both parties"
  on public.orders for select
  using (customer_user_id = auth.uid() or merchant_user_id = auth.uid());

drop policy if exists "Customer can create orders" on public.orders;
create policy "Customer can create orders"
  on public.orders for insert
  with check (customer_user_id = auth.uid());

drop policy if exists "Either party can update order" on public.orders;
create policy "Either party can update order"
  on public.orders for update
  using (customer_user_id = auth.uid() or merchant_user_id = auth.uid());

-- shop_banners（商家写，配对可读）
drop policy if exists "Banners viewable by merchant or paired" on public.shop_banners;
create policy "Banners viewable by merchant or paired"
  on public.shop_banners for select
  using (public.is_merchant_viewer(shop_banners.merchant_user_id));

drop policy if exists "Merchant can insert banners" on public.shop_banners;
create policy "Merchant can insert banners"
  on public.shop_banners for insert
  with check (merchant_user_id = auth.uid());

drop policy if exists "Merchant can delete banners" on public.shop_banners;
create policy "Merchant can delete banners"
  on public.shop_banners for delete
  using (merchant_user_id = auth.uid());

-- recipes / recipe_versions（商家写，配对可读已发布）
drop policy if exists "Recipes viewable by merchant or paired" on public.recipes;
create policy "Recipes viewable by merchant or paired"
  on public.recipes for select
  using (public.is_merchant_viewer(recipes.merchant_user_id));

drop policy if exists "Merchant can insert recipes" on public.recipes;
create policy "Merchant can insert recipes"
  on public.recipes for insert
  with check (merchant_user_id = auth.uid() and public.is_merchant());

drop policy if exists "Merchant can update recipes" on public.recipes;
create policy "Merchant can update recipes"
  on public.recipes for update
  using (merchant_user_id = auth.uid());

drop policy if exists "Merchant can delete recipes" on public.recipes;
create policy "Merchant can delete recipes"
  on public.recipes for delete
  using (merchant_user_id = auth.uid());

drop policy if exists "Recipe versions viewable by merchant or paired" on public.recipe_versions;
create policy "Recipe versions viewable by merchant or paired"
  on public.recipe_versions for select
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_versions.recipe_id and public.is_merchant_viewer(r.merchant_user_id)
  ));

drop policy if exists "Merchant can insert recipe versions" on public.recipe_versions;
create policy "Merchant can insert recipe versions"
  on public.recipe_versions for insert
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_versions.recipe_id and r.merchant_user_id = auth.uid()
  ));

drop policy if exists "Merchant can update recipe versions" on public.recipe_versions;
create policy "Merchant can update recipe versions"
  on public.recipe_versions for update
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_versions.recipe_id and r.merchant_user_id = auth.uid()
  ));

drop policy if exists "Merchant can delete recipe versions" on public.recipe_versions;
create policy "Merchant can delete recipe versions"
  on public.recipe_versions for delete
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_versions.recipe_id and r.merchant_user_id = auth.uid()
  ));

-- notification_subscriptions（本人）
drop policy if exists "Subscriptions viewable by owner" on public.notification_subscriptions;
create policy "Subscriptions viewable by owner"
  on public.notification_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "Users can manage own subscriptions" on public.notification_subscriptions;
create policy "Users can manage own subscriptions"
  on public.notification_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- notifications_sent（本人查看）
drop policy if exists "Sent notifications viewable by owner" on public.notifications_sent;
create policy "Sent notifications viewable by owner"
  on public.notifications_sent for select
  using (user_id = auth.uid() or exists (
    select 1 from public.orders o where o.id = notifications_sent.order_id and o.merchant_user_id = auth.uid()
  ));

-- ============================================================
-- 6. Realtime 发布（点餐实时接单/改状态依赖）
-- ============================================================
alter publication supabase_realtime add table public.merchant_lookup;
alter publication supabase_realtime add table public.pair_bindings;
alter publication supabase_realtime add table public.dish_categories;
alter publication supabase_realtime add table public.dishes;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.shop_banners;
alter publication supabase_realtime add table public.recipes;
alter publication supabase_realtime add table public.recipe_versions;