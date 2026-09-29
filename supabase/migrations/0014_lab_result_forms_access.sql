-- 0014 — The paper lab form is used by the Lab to record basic results (Lab Results page).
-- Table stays `lab_request_forms` (it mirrors the paper form). Access changes:
--   view:    CMD, Doctor, Nurse, Lab
--   create / edit: CMD, Lab only
--   delete:  CMD only (unchanged)
drop policy "lab_request_forms_select_clinical" on public.lab_request_forms;
drop policy "lab_request_forms_insert_clinical" on public.lab_request_forms;
drop policy "lab_request_forms_update_clinical" on public.lab_request_forms;

create policy "lab_forms_select" on public.lab_request_forms
  for select using (current_staff_role() = any (array['CMD','Doctor','Nurse','Lab']::user_role[]));
create policy "lab_forms_insert_lab" on public.lab_request_forms
  for insert with check (current_staff_role() = any (array['CMD','Lab']::user_role[]));
create policy "lab_forms_update_lab" on public.lab_request_forms
  for update using (current_staff_role() = any (array['CMD','Lab']::user_role[]));
