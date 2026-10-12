-- Custom date fields.
--
-- Adds 'date' to the custom field types an admin can create. Like every custom
-- field it is a real column on the object's table (see
-- 20260921000000_custom_fields_as_columns.sql), here of Postgres type `date`,
-- so it sorts, filters and compares as a date and can drive the workflow /
-- cadence "is within the last / next N days or months" conditions.
--
-- Additive only: existing fields and columns are untouched.

alter type public.custom_field_type add value if not exists 'date';

-- Compares on ::text rather than the enum: a value added by ALTER TYPE cannot
-- be used as an enum literal until that transaction commits, and this file may
-- run as a single transaction.
create or replace function public.custom_field_column_type(p_field_type public.custom_field_type)
returns text
language sql
immutable
as $$
  select case p_field_type::text
    when 'number' then 'numeric'
    when 'lookup' then 'uuid'
    when 'date' then 'date'
    else 'text'
  end;
$$;
