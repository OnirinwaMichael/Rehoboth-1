-- 0013 — Lab Request Form as its own saved document (replica of the paper form).
-- Standalone record: does NOT create or bill lab tests. Doctors, Nurses and CMD can
-- view/create/edit; only CMD can delete. The "for lab use only" block is stored on the
-- same row so it can be filled in later.
create table public.lab_request_forms (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on update cascade on delete cascade,
  family_member_id uuid references public.family_members(id) on delete set null,
  patient_name text,
  sex text,
  age text,
  hospital_clinic text,
  ward text,
  no text,
  clinical_history text,
  consultant text,
  provisional_diagnosis text,
  nature_of_specimen text,
  tests_required text,
  date_of_reception date,
  lab_no text,
  lab_result text,
  result_date date,
  lab_secretary text,
  created_by uuid not null references public.users(id),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index lab_request_forms_patient_idx on public.lab_request_forms(patient_id, created_at desc);

alter table public.lab_request_forms enable row level security;
create policy "lab_request_forms_select_clinical" on public.lab_request_forms
  for select using (current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[]));
create policy "lab_request_forms_insert_clinical" on public.lab_request_forms
  for insert with check (current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[]));
create policy "lab_request_forms_update_clinical" on public.lab_request_forms
  for update using (current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[]));
create policy "lab_request_forms_delete_cmd" on public.lab_request_forms
  for delete using (has_role('CMD'));

create trigger lab_request_forms_updated_at before update on public.lab_request_forms
  for each row execute function public.set_updated_at();

alter table public.lab_request_forms replica identity full;
alter publication supabase_realtime add table public.lab_request_forms;
