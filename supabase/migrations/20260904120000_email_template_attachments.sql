-- Email templates gain structured attachments (call-to-action links + poster images),
-- rendered into the outgoing email's HTML and, for posters, attached as real files too.
alter table public.email_templates
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Public bucket for poster images: public so the images load in recipients' email
-- clients and Resend can fetch them by URL; writes stay admin-only via RLS below.
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', true)
on conflict (id) do nothing;

create policy "email_attachments_admin_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "email_attachments_admin_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "email_attachments_admin_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
