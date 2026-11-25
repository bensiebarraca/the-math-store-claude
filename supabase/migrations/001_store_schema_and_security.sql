-- Applied to the Supabase project "the-math-store-claude".
-- Tables, row level security, order functions and the photo bucket.

create table public.books (
  id text primary key,
  title text not null check (char_length(title) between 1 and 200),
  level text not null check (level in ('kindergarten','primary','secondary')),
  grade_label text not null default '',
  sort int not null default 0,
  description text not null default '',
  includes text[] not null default '{}',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references public.books(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  price numeric(10,2) check (price is null or price >= 0),
  stock int check (stock is null or stock >= 0),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index variants_book_id_idx on public.variants(book_id);

create table public.book_images (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references public.books(id) on delete cascade,
  path text not null unique,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index book_images_book_id_idx on public.book_images(book_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  status text not null default 'new' check (status in ('new','confirmed','delivered','cancelled')),
  customer_name text not null,
  mobile text not null,
  street text not null,
  province text not null,
  municipality text not null,
  barangay text not null,
  notes text not null default '',
  total numeric(12,2) not null default 0,
  payment_method text not null default 'cash_before_delivery' check (payment_method = 'cash_before_delivery'),
  stock_applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid references public.variants(id) on delete set null,
  book_title text not null,
  variant_name text not null,
  unit_price numeric(10,2) not null,
  qty int not null check (qty > 0)
);
create index order_items_order_id_idx on public.order_items(order_id);
create index order_items_variant_id_idx on public.order_items(variant_id);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger books_updated_at before update on public.books for each row execute function public.set_updated_at();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.books enable row level security;
alter table public.variants enable row level security;
alter table public.book_images enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.admins enable row level security;

create policy books_read on public.books for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy variants_read on public.variants for select to anon, authenticated
  using ((select public.is_admin()) or (active and exists (select 1 from public.books b where b.id = book_id and b.published)));
create policy images_read on public.book_images for select to anon, authenticated
  using ((select public.is_admin()) or exists (select 1 from public.books b where b.id = book_id and b.published));

do $$
declare t text;
begin
  foreach t in array array['books','variants','book_images'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t||'_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t||'_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t||'_admin_delete', t);
  end loop;
end $$;

create policy orders_admin_read on public.orders for select to authenticated using ((select public.is_admin()));
create policy order_items_admin_read on public.order_items for select to authenticated using ((select public.is_admin()));

-- Customers place orders through this function. Prices and stock come from the database, never from the browser.
create function public.place_order(p_customer jsonb, p_items jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_customer->>'name',''));
  v_mobile text := btrim(coalesce(p_customer->>'mobile',''));
  v_street text := btrim(coalesce(p_customer->>'street',''));
  v_province text := btrim(coalesce(p_customer->>'province',''));
  v_muni text := btrim(coalesce(p_customer->>'municipality',''));
  v_brgy text := btrim(coalesce(p_customer->>'barangay',''));
  v_notes text := btrim(coalesce(p_customer->>'notes',''));
  v_ref text; v_id uuid; v_total numeric := 0; it jsonb; r record; v_qty int;
begin
  if v_name = '' or v_mobile = '' or v_street = '' or v_province = '' or v_muni = '' or v_brgy = '' then
    raise exception 'Please fill in your name, mobile number and the full delivery address.';
  end if;
  if char_length(v_name) > 120 or char_length(v_mobile) > 40 or char_length(v_street) > 200
     or char_length(v_province) > 80 or char_length(v_muni) > 80 or char_length(v_brgy) > 80 or char_length(v_notes) > 500 then
    raise exception 'One of the fields is too long.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Your order is empty.';
  end if;

  v_ref := 'MS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into public.orders (ref, customer_name, mobile, street, province, municipality, barangay, notes)
  values (v_ref, v_name, v_mobile, v_street, v_province, v_muni, v_brgy, v_notes)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 20 then raise exception 'Invalid quantity.'; end if;
    select v.id, v.price, v.stock, v.name as vname, b.title into r
      from public.variants v join public.books b on b.id = v.book_id
      where v.id = (it->>'variant_id')::uuid and v.active and b.published;
    if not found then raise exception 'One of the books is no longer available.'; end if;
    if r.price is null then raise exception '% (%) is priced on request. Please message us.', r.title, r.vname; end if;
    if r.stock is not null and r.stock < v_qty then
      raise exception 'Only % left of % (%).', r.stock, r.title, r.vname;
    end if;
    insert into public.order_items (order_id, variant_id, book_title, variant_name, unit_price, qty)
    values (v_id, r.id, r.title, r.vname, r.price, v_qty);
    v_total := v_total + r.price * v_qty;
  end loop;

  update public.orders set total = v_total where id = v_id;
  return v_ref;
end $$;
revoke all on function public.place_order(jsonb, jsonb) from public;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated;

-- Admin only: confirm (deducts stock), deliver, or cancel (restocks if it was confirmed).
create function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare o record; i record; s int;
begin
  if not (select public.is_admin()) then raise exception 'Not authorized.'; end if;
  if p_status not in ('confirmed','delivered','cancelled') then raise exception 'Invalid status.'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.'; end if;
  if not ((o.status = 'new' and p_status in ('confirmed','cancelled'))
       or (o.status = 'confirmed' and p_status in ('delivered','cancelled'))) then
    raise exception 'That change is not allowed for a % order.', o.status;
  end if;

  if p_status = 'confirmed' and not o.stock_applied then
    for i in select * from public.order_items where order_id = o.id and variant_id is not null loop
      select stock into s from public.variants where id = i.variant_id for update;
      if s is not null then
        if s < i.qty then raise exception 'Not enough stock for % (%): % left.', i.book_title, i.variant_name, s; end if;
        update public.variants set stock = stock - i.qty where id = i.variant_id;
      end if;
    end loop;
    update public.orders set stock_applied = true where id = o.id;
  elsif p_status = 'cancelled' and o.stock_applied then
    for i in select * from public.order_items where order_id = o.id and variant_id is not null loop
      update public.variants set stock = stock + i.qty where id = i.variant_id and stock is not null;
    end loop;
    update public.orders set stock_applied = false where id = o.id;
  end if;

  update public.orders set status = p_status, updated_at = now() where id = o.id;
end $$;
revoke all on function public.set_order_status(uuid, text) from public, anon;
grant execute on function public.set_order_status(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-images', 'book-images', true, 5242880, array['image/jpeg','image/png','image/webp']);
create policy book_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'book-images' and (select public.is_admin()));
create policy book_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'book-images' and (select public.is_admin()))
  with check (bucket_id = 'book-images' and (select public.is_admin()));
create policy book_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'book-images' and (select public.is_admin()));
