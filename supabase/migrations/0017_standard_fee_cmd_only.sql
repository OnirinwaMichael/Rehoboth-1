-- 0017 — Only CMD can change clinic settings (the standard consultation fee).
-- CMD, Doctor and Nurse can still READ it (needed to pre-fill new consultations).
drop policy "app_settings_insert_clinical" on public.app_settings;
drop policy "app_settings_update_clinical" on public.app_settings;
create policy "app_settings_insert_cmd" on public.app_settings for insert
  with check ((select current_staff_role()) = 'CMD'::user_role);
create policy "app_settings_update_cmd" on public.app_settings for update
  using ((select current_staff_role()) = 'CMD'::user_role)
  with check ((select current_staff_role()) = 'CMD'::user_role);
