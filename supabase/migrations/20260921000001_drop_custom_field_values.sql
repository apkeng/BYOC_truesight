-- Companion cleanup for …_custom_fields_as_columns.sql.
--
-- NOT applied automatically. Run it only once the column-backed custom fields
-- have been verified in the app: it throws away the legacy value rows, which
-- are the only way back to the pre-migration shape.

do $$
declare
  f record;
  v_source text;
  v_missing bigint;
begin
  -- Refuse to drop anything that has not actually been carried across.
  for f in select * from public.custom_fields loop
    if not public.is_custom_field_column(f.object_name, f.field_name) then
      raise exception 'Custom field "%" on "%" has no column yet - run the column migration first',
        f.field_name, f.object_name;
    end if;

    v_source := case f.field_type
      when 'number' then 'value_number'
      when 'lookup' then 'value_lookup'
      else 'value_text'
    end;

    execute format(
      'select count(*)
         from public.custom_field_values v
         join public.%I t on t.id = v.record_id
        where v.custom_field_id = %L
          and v.%I is not null
          and t.%I is distinct from v.%I',
      f.object_name, f.id, v_source, f.field_name, v_source
    ) into v_missing;

    if v_missing > 0 then
      raise exception '% value(s) of custom field "%" on "%" differ from the column - re-run the backfill first',
        v_missing, f.field_name, f.object_name;
    end if;
  end loop;
end;
$$;

drop table public.custom_field_values;
