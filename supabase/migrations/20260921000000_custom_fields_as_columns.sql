-- Custom fields become real columns on the object table.
--
-- Before: `custom_fields` held the metadata and every value lived as a row in
-- `custom_field_values` (custom_field_id, record_id, value_text/number/lookup).
-- Reading a record therefore took a second query plus a merge, and a custom
-- field could not be filtered, sorted, indexed or selected like a real field.
--
-- After: `custom_fields` is still the metadata catalog (label, type, picklist
-- values, lookup target), but the value lives in a column named after
-- `field_name` on the object's own table. A custom field now comes back with
-- `select *`, is covered by that table's RLS, and `{{lead_city}}` merge fields
-- resolve straight off the row.
--
-- Adding a column needs rights an authenticated user does not have, so field
-- creation and deletion go through SECURITY DEFINER functions that admit
-- admins only and build every identifier with format(%I) from a validated
-- name. Each column this catalog creates is tagged with a column comment, so
-- the drop path can never take out a hand-written base column that happens to
-- share a name.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/** The object tables a custom field may be attached to (mirrors the
    custom_fields.object_name check constraint). */
create or replace function public.custom_field_object_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'leads', 'organizations', 'meetings', 'demos', 'contracts', 'invoices', 'revenues'
  ]::text[];
$$;

/** Postgres column type backing each custom field type. */
create or replace function public.custom_field_column_type(p_field_type public.custom_field_type)
returns text
language sql
immutable
as $$
  select case p_field_type
    when 'number' then 'numeric'
    when 'lookup' then 'uuid'
    else 'text'
  end;
$$;

/** Marker written as a column comment on every column this catalog creates. */
create or replace function public.custom_field_column_marker()
returns text
language sql
immutable
as $$
  select 'crm:custom_field'::text;
$$;

/** True when p_column exists on p_table and was created by this catalog. */
create or replace function public.is_custom_field_column(p_table text, p_column text)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_comment text;
begin
  select col_description(a.attrelid, a.attnum)
    into v_comment
  from pg_attribute a
  where a.attrelid = format('public.%I', p_table)::regclass
    and a.attname = p_column
    and a.attnum > 0
    and not a.attisdropped;

  return found and v_comment is not distinct from public.custom_field_column_marker();
end;
$$;

-- ---------------------------------------------------------------------------
-- Create / delete a custom field (metadata + column, in one transaction)
-- ---------------------------------------------------------------------------

create or replace function public.create_custom_field(
  p_object_name text,
  p_field_name text,
  p_field_label text,
  p_field_type public.custom_field_type,
  p_picklist_values jsonb default null,
  p_lookup_object text default null
)
returns public.custom_fields
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tables text[] := public.custom_field_object_tables();
  v_name text := lower(btrim(coalesce(p_field_name, '')));
  v_row public.custom_fields;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create custom fields' using errcode = '42501';
  end if;

  if p_object_name is null or not (p_object_name = any (v_tables)) then
    raise exception 'Unknown object "%"', p_object_name using errcode = '22023';
  end if;

  -- Anything that reaches format(%I) below has to be a plain snake_case
  -- identifier: a letter, then letters, digits or underscores.
  if v_name !~ '^[a-z][a-z0-9_]{0,57}$' then
    raise exception
      'Field name "%" must start with a letter and contain only lowercase letters, digits and underscores (max 58 characters)',
      p_field_name using errcode = '22023';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_object_name and column_name = v_name
  ) then
    raise exception '"%" already has a field named "%"', p_object_name, v_name using errcode = '42701';
  end if;

  if p_field_type = 'lookup' then
    if p_lookup_object is null or not (p_lookup_object = any (v_tables)) then
      raise exception 'A lookup field needs a target object' using errcode = '22023';
    end if;
    execute format(
      'alter table public.%I add column %I uuid references public.%I(id) on delete set null',
      p_object_name, v_name, p_lookup_object
    );
  else
    execute format(
      'alter table public.%I add column %I %s',
      p_object_name, v_name, public.custom_field_column_type(p_field_type)
    );
  end if;

  execute format(
    'comment on column public.%I.%I is %L',
    p_object_name, v_name, public.custom_field_column_marker()
  );

  insert into public.custom_fields (
    object_name, field_name, field_label, field_type, picklist_values, lookup_object, created_by
  )
  values (
    p_object_name,
    v_name,
    p_field_label,
    p_field_type,
    case when p_field_type = 'picklist' then p_picklist_values end,
    case when p_field_type = 'lookup' then p_lookup_object end,
    auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_custom_field(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_field public.custom_fields;
  v_tables text[] := public.custom_field_object_tables();
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete custom fields' using errcode = '42501';
  end if;

  select * into v_field from public.custom_fields where id = p_id;
  if not found then
    return;
  end if;

  if v_field.object_name = any (v_tables)
     and v_field.field_name ~ '^[a-z][a-z0-9_]{0,57}$'
  then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = v_field.object_name
        and column_name = v_field.field_name
    ) then
      -- Only ever drop a column this catalog created. A column that is not
      -- tagged is a base column, and dropping it would take the schema with it.
      if not public.is_custom_field_column(v_field.object_name, v_field.field_name) then
        raise exception
          '"%.%" is a base column, not a custom field - refusing to drop it',
          v_field.object_name, v_field.field_name using errcode = '42501';
      end if;
      execute format(
        'alter table public.%I drop column %I',
        v_field.object_name, v_field.field_name
      );
    end if;
  end if;

  delete from public.custom_fields where id = p_id;
end;
$$;

revoke all on function public.create_custom_field(text, text, text, public.custom_field_type, jsonb, text) from public;
revoke all on function public.delete_custom_field(uuid) from public;
grant execute on function public.create_custom_field(text, text, text, public.custom_field_type, jsonb, text) to authenticated;
grant execute on function public.delete_custom_field(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: give every existing custom field a column and copy its values over
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
  v_source text;
begin
  for f in select * from public.custom_fields order by object_name, field_name loop
    if not (f.object_name = any (public.custom_field_object_tables())) then
      raise exception 'Custom field "%" is attached to unknown object "%"', f.field_name, f.object_name;
    end if;

    if f.field_name !~ '^[a-z][a-z0-9_]{0,57}$' then
      raise exception
        'Custom field "%" on "%" cannot become a column: rename it to snake_case first',
        f.field_name, f.object_name;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = f.object_name and column_name = f.field_name
    ) then
      -- Already migrated, or a genuine clash with a base column. The clash has
      -- to be resolved by hand: silently writing into a base column would
      -- corrupt it.
      if not public.is_custom_field_column(f.object_name, f.field_name) then
        raise exception
          'Custom field "%" collides with the existing "%.%" column - rename the custom field before migrating',
          f.field_name, f.object_name, f.field_name;
      end if;
    else
      if f.field_type = 'lookup' and f.lookup_object is not null then
        execute format(
          'alter table public.%I add column %I uuid references public.%I(id) on delete set null',
          f.object_name, f.field_name, f.lookup_object
        );
      else
        execute format(
          'alter table public.%I add column %I %s',
          f.object_name, f.field_name, public.custom_field_column_type(f.field_type)
        );
      end if;
      execute format(
        'comment on column public.%I.%I is %L',
        f.object_name, f.field_name, public.custom_field_column_marker()
      );
    end if;

    v_source := case f.field_type
      when 'number' then 'value_number'
      when 'lookup' then 'value_lookup'
      else 'value_text'
    end;

    -- `t.%I is null` keeps this re-runnable: a column already carrying a value
    -- is never overwritten by the legacy row.
    execute format(
      'update public.%I t
          set %I = v.val
         from (select record_id, %I as val
                 from public.custom_field_values
                where custom_field_id = %L) v
        where v.record_id = t.id and t.%I is null',
      f.object_name, f.field_name, v_source, f.id, f.field_name
    );
  end loop;
end;
$$;

-- custom_field_values is left in place, populated, as a rollback net. Once the
-- column-backed fields have been verified in the app, drop it with the
-- companion migration (…_drop_custom_field_values.sql).
comment on table public.custom_field_values is
  'DEPRECATED - custom field values now live in real columns on the object table. Kept only as a backfill/rollback source.';
