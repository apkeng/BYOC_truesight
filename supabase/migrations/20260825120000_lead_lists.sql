create table public.lead_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_date timestamptz not null default now()
);

create table public.lead_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lead_lists(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  added_date timestamptz not null default now(),
  unique (list_id, lead_id)
);

alter table public.lead_lists enable row level security;
alter table public.lead_list_members enable row level security;

create policy lead_lists_select_own on public.lead_lists
  for select using (created_by = auth.uid());

create policy lead_lists_insert_own on public.lead_lists
  for insert with check (created_by = auth.uid());

create policy lead_lists_delete_own on public.lead_lists
  for delete using (created_by = auth.uid());

create policy lead_list_members_select_own on public.lead_list_members
  for select using (
    exists (select 1 from public.lead_lists l where l.id = list_id and l.created_by = auth.uid())
  );

create policy lead_list_members_insert_own on public.lead_list_members
  for insert with check (
    exists (select 1 from public.lead_lists l where l.id = list_id and l.created_by = auth.uid())
  );

create policy lead_list_members_delete_own on public.lead_list_members
  for delete using (
    exists (select 1 from public.lead_lists l where l.id = list_id and l.created_by = auth.uid())
  );
