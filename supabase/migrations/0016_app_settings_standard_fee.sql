-- 0016 — Clinic-wide settings (first one: the standard consultation fee).
-- No value is seeded: the fee stays "not set" until staff enter it. CMD, Doctor and Nurse can
-- view and change it; every change is stamped with who/when and written to audit_logs.
-- The fee is copied into each consultation when it is saved, so later changes never alter
-- past records or bills.
create table public.app_settings (
  key text primary key check (key in ('standard_consultation_fee')),
  value_numeric numeric check (value_numeric is null or value_numeric >= 0),
  updated_by uuid references public.users(id),
  updated_by_name text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
create policy "app_settings_select_clinical" on public.app_settings for select
  using ((select current_staff_role()) = any (array['CMD','Doctor','Nurse']::user_role[]));
create policy "app_settings_insert_clinical" on public.app_settings for insert
  with check ((select current_staff_role()) = any (array['CMD','Doctor','Nurse']::user_role[]));
create policy "app_settings_update_clinical" on public.app_settings for update
  using ((select current_staff_role()) = any (array['CMD','Doctor','Nurse']::user_role[]))
  with check ((select current_staff_role()) = any (array['CMD','Doctor','Nurse']::user_role[]));
-- no delete policy: settings can be changed but not removed

create function public.app_settings_stamp() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  NEW.updated_by := auth.uid();
  NEW.updated_by_name := (select name from public.users where id = auth.uid());
  NEW.updated_at := now();
  return NEW;
end $fn$;
create trigger trg_app_settings_stamp before insert or update on public.app_settings
  for each row execute function public.app_settings_stamp();

create function public.app_settings_audit() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into public.audit_logs(staff_id, action, details)
  values (auth.uid(), 'SETTING_CHANGED',
    format('%s changed from %s to %s', NEW.key,
           coalesce(case when TG_OP = 'UPDATE' then OLD.value_numeric::text end, 'not set'),
           coalesce(NEW.value_numeric::text, 'not set')));
  return NEW;
end $fn$;
create trigger trg_app_settings_audit after insert or update on public.app_settings
  for each row execute function public.app_settings_audit();

alter publication supabase_realtime add table public.app_settings;
