-- Workflow notifications could only be created by admins.
--
-- runWorkflows() executes against the acting user's session client, so the
-- notifications INSERT policy ran as whoever saved the record. That policy
-- required is_admin(), so a non-admin creating or updating a record silently
-- failed to notify anyone -- the insert error was discarded by the caller, so
-- the feature simply appeared dead for every non-admin user.
--
-- Widening the policy to "any authenticated user" would let anyone write to
-- anyone's notification bell. Instead, allow the insert only when an active
-- notification workflow actually exists for the object the row points at, which
-- is exactly the situation runWorkflows() inserts in.

-- Mirrors the existing is_admin() helper: SECURITY DEFINER so the check does not
-- depend on the caller's visibility of the workflows table.
create or replace function public.has_active_notification_workflow(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from workflows
    where active
      and trigger_type = 'notification'
      and object_name = p_object_name
  );
$$;

comment on function public.has_active_notification_workflow(text) is
  'True when an active notification workflow targets the given object. Used by the notifications INSERT policy so non-admins can trigger workflow notifications.';

-- PERMISSIVE policies are OR-ed together, so this grants the new path whether or
-- not the original admin-only policy is still present or named as expected.
drop policy if exists notifications_insert_workflow on public.notifications;

create policy notifications_insert_workflow
  on public.notifications
  for insert
  to authenticated
  with check (
    is_admin()
    or has_active_notification_workflow(object_name)
  );
