-- 0033 — Clinic-wide idle auto-logout timeouts, in minutes.
--   idle_timeout_minutes           : everyone (CMD, Receptionist, Accountant, Lab, Pharmacy)
--   idle_timeout_clinical_minutes  : Doctors and Nurses
-- Only CMD can change them (existing insert/update policies from 0017). Every active staff member
-- can READ these two keys, because the app needs them to run the idle timer.
-- No rows are seeded: with no row the app uses 10 minutes for everyone.
-- Allowed range is a whole number of minutes from 5 to 120 (the 60-second warning needs headroom).

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('standard_consultation_fee', 'time_format', 'idle_timeout_minutes', 'idle_timeout_clinical_minutes'));

alter table public.app_settings add constraint app_settings_idle_minutes_check
  check (key not in ('idle_timeout_minutes', 'idle_timeout_clinical_minutes')
         or (value_numeric between 5 and 120 and value_numeric = trunc(value_numeric)));

create policy "app_settings_select_idle_timeout" on public.app_settings for select
  using (key in ('idle_timeout_minutes', 'idle_timeout_clinical_minutes')
         and (select current_staff_role()) is not null);
