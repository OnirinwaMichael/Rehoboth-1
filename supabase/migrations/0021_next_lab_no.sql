-- 0021 — Auto-generated Lab No for the Basic Lab Request Form.
-- Format LAB-<year>-<4 digits> (e.g. LAB-2026-0001); the counter restarts every
-- calendar year (Africa/Lagos). Numbers are drawn atomically by next_lab_no(), so
-- two lab staff saving at the same moment can never receive the same number.
-- Additive only: no existing table or row is changed.
create table public.lab_no_counters (
  year int primary key,
  last_value int not null default 0
);
alter table public.lab_no_counters enable row level security;
-- No policies on purpose: only next_lab_no() (security definer) touches this table.

create or replace function public.next_lab_no()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_year int := extract(year from (now() at time zone 'Africa/Lagos'))::int;
  v_n int;
begin
  -- coalesce: has_role() is NULL when nobody is signed in, and `if not NULL` would let the call through
  if not coalesce(has_role('Lab') or has_role('CMD'), false) then
    raise exception 'Only Lab or CMD can generate a Lab No';
  end if;
  insert into public.lab_no_counters (year, last_value) values (v_year, 1)
    on conflict (year) do update set last_value = public.lab_no_counters.last_value + 1
    returning last_value into v_n;
  return 'LAB-' || v_year || '-' || lpad(v_n::text, 4, '0');
end;
$$;

revoke execute on function public.next_lab_no() from anon;
revoke execute on function public.next_lab_no() from public;
grant execute on function public.next_lab_no() to authenticated;
