-- Scheduled workflows: a workflow that runs at a due time and sweeps every
-- matching record, instead of running off a single record's save.
--
-- The action a scheduled workflow performs is still workflows.trigger_type -
-- field_update, notification or email_alert. External POST/GET is deliberately
-- NOT schedulable (see SCHEDULABLE_TRIGGER_TYPES in src/lib/types.ts): a sweep
-- can match hundreds of records and firing that many webhooks from a cron tick
-- is a different feature.
--
-- Existing workflows all default to run_mode 'on_save', so nothing changes
-- behaviour until an admin switches a workflow over.

alter table public.workflows
  add column if not exists run_mode text not null default 'on_save'
    check (run_mode in ('on_save', 'scheduled')),
  -- Same shape the cadence scheduled trigger already uses, read by the shared
  -- isScheduleDue() in src/lib/schedule.ts:
  --   { "schedule_type": "daily",    "at_time": "09:00" }
  --   { "schedule_type": "interval", "interval_minutes": 60 }
  add column if not exists schedule_config jsonb not null default '{}'::jsonb,
  -- Engine state, not admin config: stamped when a due run is claimed, and it
  -- is what stops the next cron tick re-running the same sweep.
  add column if not exists last_run_at timestamptz;

comment on column public.workflows.run_mode is
  'on_save = fires after a record create/update; scheduled = swept by the cron at a due time.';
comment on column public.workflows.schedule_config is
  'Only meaningful when run_mode = scheduled. daily+at_time (UTC) or interval+interval_minutes.';
comment on column public.workflows.last_run_at is
  'When the scheduled engine last claimed a run for this workflow. Set before the actions run.';

-- The engine's only query is "active scheduled workflows", run every cron tick.
create index if not exists workflows_scheduled_idx
  on public.workflows (run_mode, active)
  where run_mode = 'scheduled';
