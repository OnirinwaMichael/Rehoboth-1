-- 0032 — Clinic-wide time format (12-hour / 24-hour).
-- Stored in app_settings under key 'time_format' with value_text '12h' or '24h'.
-- No row is seeded: when there is no row the app shows 12-hour time (the default).
-- Only CMD can change it (existing insert/update policies from 0017 already allow only CMD).
-- Every active staff member can READ this one key (it is not sensitive, and every role shows times).
-- The standard consultation fee row and its CMD/Doctor/Nurse-only read policy are untouched.

alter table public.app_settings add column value_text text;

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('standard_consultation_fee', 'time_format'));
alter table public.app_settings add constraint app_settings_value_text_check
  check (key <> 'time_format' or value_text in ('12h', '24h'));

create policy "app_settings_select_time_format" on public.app_settings for select
  using (key = 'time_format' and (select current_staff_role()) is not null);

-- Audit line now covers text values too, so a time-format change shows as e.g. "time_format changed from 12h to 24h".
create or replace function public.app_settings_audit() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into public.audit_logs(staff_id, action, details)
  values (auth.uid(), 'SETTING_CHANGED',
    format('%s changed from %s to %s', NEW.key,
           coalesce(case when TG_OP = 'UPDATE' then coalesce(OLD.value_numeric::text, OLD.value_text) end, 'not set'),
           coalesce(NEW.value_numeric::text, NEW.value_text, 'not set')));
  return NEW;
end $fn$;
