-- Moves both cron engines off GitHub Actions and onto Supabase pg_cron.
--
-- Why: a GitHub Actions schedule is best-effort (routinely 5-20 minutes late
-- under load, occasionally dropped) and GitHub disables scheduled workflows in
-- any repo with 60 days of no commits - a silent stop for a CRM that is simply
-- finished being built. pg_cron runs inside the database and does neither.
--
-- The jobs call the app's existing /api/cron/* routes rather than duplicating
-- the engines in SQL, so there is still exactly one implementation of each.
--
-- SECRETS: both values are read from Supabase Vault at run time, by name, so
-- nothing sensitive is stored in cron.job (which is why the job body selects
-- from vault.decrypted_secrets instead of interpolating the values here).
-- This migration does NOT create them. Set them once per project, by hand:
--
--   select vault.create_secret('https://<your-app>.vercel.app', 'crm_app_url', '');
--   select vault.create_secret('<the CRON_SECRET value>',       'crm_cron_secret', '');
--
-- Until crm_cron_secret exists, the jobs run but the app answers 401. That is
-- harmless and self-correcting: add the secret and the next tick works.
--
-- Cadences stay on 15 minutes (unchanged from the Actions schedule, already
-- proven at that rate). Scheduled workflows run every 5 minutes, because a
-- workflow due "daily at 09:00" should not wait a quarter of an hour.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule first so re-running this migration re-creates the
-- jobs rather than failing on a duplicate jobname.
select cron.unschedule(jobname)
from cron.job
where jobname in ('scheduled-workflows', 'cadence-engine');

select cron.schedule(
  'scheduled-workflows',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'crm_app_url')
           || '/api/cron/workflows',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

select cron.schedule(
  'cadence-engine',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'crm_app_url')
           || '/api/cron/cadences',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- Handy for debugging later:
--   select * from cron.job;                                    -- what is scheduled
--   select * from cron.job_run_details order by start_time desc limit 20;  -- did it fire
--   select id, status_code, error_msg, created from net._http_response
--     order by created desc limit 20;                          -- what the app answered
