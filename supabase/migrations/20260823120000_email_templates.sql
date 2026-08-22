-- Email templates (admin-managed) and a log of emails sent from lead records.
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  object_name text not null default 'leads',
  name text not null,
  subject text not null,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.email_templates(id) on delete set null,
  object_name text not null,
  record_id uuid not null,
  to_email text not null,
  subject text not null,
  body text not null,
  sent_by uuid references public.profiles(id) on delete set null,
  status text not null default 'sent',
  error text,
  sent_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
alter table public.email_log enable row level security;

-- Any authenticated user can read templates (sales needs them to compose emails);
-- only admins can create/edit/delete them.
create policy "email_templates_select_authenticated" on public.email_templates
  for select to authenticated using (true);

create policy "email_templates_admin_write" on public.email_templates
  for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Any authenticated user can see the send log; a user may only log a send as themselves.
create policy "email_log_select_authenticated" on public.email_log
  for select to authenticated using (true);

create policy "email_log_insert_own" on public.email_log
  for insert to authenticated with check (sent_by = auth.uid());
