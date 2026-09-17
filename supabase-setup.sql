-- ChienY. Workshop：單一使用者、無登入版本
-- 在「她自己的 Supabase 專案」→ SQL Editor → New query 貼上並執行一次。
--
-- 注意：這個版本沒有登入系統，因此只要有人同時取得該專案 URL + Anon/Publishable Key，
-- 就能使用相同權限。請不要把她的 URL/Key 寫進公開 GitHub。

create table if not exists public.colors (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
    image_url text,
    image_path text,
    created_at timestamptz not null default now()
);

alter table public.colors enable row level security;

drop policy if exists "chieny anon read colors" on public.colors;
drop policy if exists "chieny anon insert colors" on public.colors;
drop policy if exists "chieny anon update colors" on public.colors;
drop policy if exists "chieny anon delete colors" on public.colors;

create policy "chieny anon read colors"
on public.colors for select
to anon
using (true);

create policy "chieny anon insert colors"
on public.colors for insert
to anon
with check (true);

create policy "chieny anon update colors"
on public.colors for update
to anon
using (true)
with check (true);

create policy "chieny anon delete colors"
on public.colors for delete
to anon
using (true);

-- 建立公開圖片 Bucket。若已存在，就確保它是 public。
insert into storage.buckets (id, name, public)
values ('yarn-images', 'yarn-images', true)
on conflict (id) do update set public = true;

drop policy if exists "chieny anon read yarn images" on storage.objects;
drop policy if exists "chieny anon upload yarn images" on storage.objects;
drop policy if exists "chieny anon update yarn images" on storage.objects;
drop policy if exists "chieny anon delete yarn images" on storage.objects;

create policy "chieny anon read yarn images"
on storage.objects for select
to anon
using (bucket_id = 'yarn-images');

create policy "chieny anon upload yarn images"
on storage.objects for insert
to anon
with check (bucket_id = 'yarn-images');

create policy "chieny anon update yarn images"
on storage.objects for update
to anon
using (bucket_id = 'yarn-images')
with check (bucket_id = 'yarn-images');

create policy "chieny anon delete yarn images"
on storage.objects for delete
to anon
using (bucket_id = 'yarn-images');
