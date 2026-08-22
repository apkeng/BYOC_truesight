-- Custom picklist fields are now configured through the shared picklist_values
-- table (same as built-in picklist fields), so admin/picklists can manage them.
-- Backfill any values that were only stored on custom_fields.picklist_values.
insert into public.picklist_values (object_name, field_name, value, is_default, sort_order)
select
  cf.object_name,
  cf.field_name,
  val.value,
  val.ordinality = 1,
  val.ordinality::int
from public.custom_fields cf
cross join lateral jsonb_array_elements_text(cf.picklist_values) with ordinality as val(value, ordinality)
where cf.field_type = 'picklist'
  and not exists (
    select 1 from public.picklist_values pv
    where pv.object_name = cf.object_name and pv.field_name = cf.field_name
  );
