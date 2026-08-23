create table public.user_field_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_name text not null,
  fields text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, object_name)
);

alter table public.user_field_views enable row level security;

create policy user_field_views_select_own on public.user_field_views
  for select using (user_id = auth.uid());

create policy user_field_views_insert_own on public.user_field_views
  for insert with check (user_id = auth.uid());

create policy user_field_views_update_own on public.user_field_views
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_field_views_delete_own on public.user_field_views
  for delete using (user_id = auth.uid());
