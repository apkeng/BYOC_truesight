-- Email alerts: a named, reusable "send this template to these people" action
-- that a workflow can fire when a record matches its condition.
--
-- Recipients are one of two kinds, and they are deliberately not mixed on a
-- single alert - the audiences want different wording, so they want different
-- templates:
--   'internal' - hand-picked CRM users, listed in recipient_user_ids
--   'lead'     - the lead the workflow fired on (its work/personal email)
--
-- template_id is ON DELETE SET NULL to match cadence_steps: deleting a template
-- must not silently delete the alerts (or workflows) built on it. An alert with
-- no template is skipped at send time and says so in the email log.

-- workflows.trigger_type is an enum, not free text, so the new action has to be
-- added to the type before any workflow can name it.
alter type public.workflow_trigger_type add value if not exists 'email_alert';

create table if not exists public.email_alerts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  object_name text not null default 'leads',
  template_id uuid references public.email_templates(id) on delete set null,
  recipient_type text not null default 'internal'
    check (recipient_type in ('internal', 'lead')),
  -- Plain uuid[] rather than a join table: the list is hand-picked, short, and
  -- always read as a whole. Ids of deleted users are skipped at send time.
  recipient_user_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.email_alerts is
  'Reusable email action fired by a workflow (trigger_type = email_alert).';
comment on column public.email_alerts.recipient_user_ids is
  'Hand-picked profiles.id values; only used when recipient_type = ''internal''.';

create index if not exists email_alerts_object_name_idx
  on public.email_alerts (object_name);

alter table public.email_alerts enable row level security;

-- Readable by any signed-in user (the workflow form lists them); only admins
-- can create or change one, matching email_templates and cadences.
drop policy if exists email_alerts_select_authenticated on public.email_alerts;
create policy email_alerts_select_authenticated
  on public.email_alerts for select to authenticated using (true);

drop policy if exists email_alerts_admin_insert on public.email_alerts;
create policy email_alerts_admin_insert
  on public.email_alerts for insert to authenticated with check (is_admin());

drop policy if exists email_alerts_admin_update on public.email_alerts;
create policy email_alerts_admin_update
  on public.email_alerts for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists email_alerts_admin_delete on public.email_alerts;
create policy email_alerts_admin_delete
  on public.email_alerts for delete to authenticated using (is_admin());
