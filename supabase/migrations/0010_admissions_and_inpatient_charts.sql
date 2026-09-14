-- Admissions: a lightweight admit/discharge record. No ward/bed by
-- request. A patient is "currently admitted" when they have an
-- admissions row with discharged_at still null.
create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on update cascade on delete cascade,
  admitted_at timestamptz not null default now(),
  admitted_by uuid not null references public.users(id),
  reason text,
  discharged_at timestamptz,
  discharged_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index idx_admissions_patient on public.admissions(patient_id);
create unique index idx_admissions_one_active_per_patient
  on public.admissions(patient_id) where (discharged_at is null);

alter table public.admissions enable row level security;
create policy "admissions_select_clinical" on public.admissions
  for select using (
    current_staff_role() = any (array['CMD','Doctor','Nurse','Pharmacy','Receptionist']::user_role[])
  );
create policy "admissions_insert_clinical" on public.admissions
  for insert with check (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "admissions_update_clinical" on public.admissions
  for update using (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "admissions_delete_cmd" on public.admissions
  for delete using (has_role('CMD'));

-- Drug Chart: one row per administration event. The paper form's
-- grid (dates down, drugs across) is a pivot of these rows, built
-- in the UI rather than forced into a rigid grid schema.
create table public.drug_chart_entries (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null references public.admissions(id) on delete cascade,
  patient_id text not null references public.patients(card_id) on update cascade on delete cascade,
  entry_date date not null default current_date,
  drug_name text not null,
  dose text,
  time_given text,
  administered_by uuid not null references public.users(id),
  notes text,
  created_at timestamptz not null default now()
);
create index idx_drug_chart_admission on public.drug_chart_entries(admission_id);

alter table public.drug_chart_entries enable row level security;
create policy "drug_chart_select_clinical" on public.drug_chart_entries
  for select using (
    current_staff_role() = any (array['CMD','Doctor','Nurse','Pharmacy']::user_role[])
  );
create policy "drug_chart_insert_clinical" on public.drug_chart_entries
  for insert with check (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "drug_chart_update_clinical" on public.drug_chart_entries
  for update using (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "drug_chart_delete_cmd" on public.drug_chart_entries
  for delete using (has_role('CMD'));

-- Vital Signs Chart: matches the paper form exactly - per date,
-- three time-of-day readings (Night/Morning/Afternoon), each with
-- Temperature/Pulse/Respiration/Blood Pressure.
create table public.vital_signs_entries (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null references public.admissions(id) on delete cascade,
  patient_id text not null references public.patients(card_id) on update cascade on delete cascade,
  entry_date date not null default current_date,
  time_of_day text not null check (time_of_day in ('Night','Morning','Afternoon')),
  temperature text,
  pulse text,
  respiration text,
  blood_pressure text,
  recorded_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique (admission_id, entry_date, time_of_day)
);
create index idx_vital_signs_admission on public.vital_signs_entries(admission_id);

alter table public.vital_signs_entries enable row level security;
create policy "vital_signs_select_clinical" on public.vital_signs_entries
  for select using (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "vital_signs_insert_clinical" on public.vital_signs_entries
  for insert with check (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "vital_signs_update_clinical" on public.vital_signs_entries
  for update using (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "vital_signs_delete_cmd" on public.vital_signs_entries
  for delete using (has_role('CMD'));

-- Antenatal Follow-up: one row per antenatal visit (repeating log).
create table public.antenatal_followups (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on update cascade on delete cascade,
  visit_date date not null default current_date,
  height_of_fundus text,
  presentation_position text,
  foetal_heart text,
  blood_pressure text,
  urine_test text,
  weight text,
  hgb_pcv text,
  remarks text,
  treatment text,
  recorded_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index idx_antenatal_followups_patient on public.antenatal_followups(patient_id);

alter table public.antenatal_followups enable row level security;
create policy "antenatal_followups_select_clinical" on public.antenatal_followups
  for select using (
    current_staff_role() = any (array['CMD','Doctor','Nurse','Pharmacy','Accountant']::user_role[])
  );
create policy "antenatal_followups_insert_clinical" on public.antenatal_followups
  for insert with check (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "antenatal_followups_update_clinical" on public.antenatal_followups
  for update using (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "antenatal_followups_delete_cmd" on public.antenatal_followups
  for delete using (has_role('CMD'));

-- Antenatal Booking: one record per patient (booking history +
-- examination findings), with a small repeating "previous
-- pregnancy" table stored as jsonb since it's bounded and always
-- edited together with the rest of the booking.
create table public.antenatal_bookings (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null unique references public.patients(card_id) on update cascade on delete cascade,
  in_patient_no text,
  tribe text,
  husband_occupation text,
  past_medical_history text,
  lmp date,
  edd date,
  gravida text,
  para text,
  no_alive text,
  no_dead text,
  abortion text,
  previous_pregnancies jsonb not null default '[]',
  history_present_pregnancy text,
  examination_breast text,
  examination_height text,
  examination_cvs text,
  examination_pelvis text,
  examination_abdomen text,
  examination_shape text,
  examination_size text,
  general_appearance text,
  created_by uuid not null references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.antenatal_bookings enable row level security;
create policy "antenatal_bookings_select_clinical" on public.antenatal_bookings
  for select using (
    current_staff_role() = any (array['CMD','Doctor','Nurse','Pharmacy','Accountant']::user_role[])
  );
create policy "antenatal_bookings_insert_clinical" on public.antenatal_bookings
  for insert with check (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "antenatal_bookings_update_clinical" on public.antenatal_bookings
  for update using (
    current_staff_role() = any (array['CMD','Doctor','Nurse']::user_role[])
  );
create policy "antenatal_bookings_delete_cmd" on public.antenatal_bookings
  for delete using (has_role('CMD'));

create trigger antenatal_bookings_updated_at
  before update on public.antenatal_bookings
  for each row execute function public.set_updated_at();

-- Realtime, matching the rest of the app's live-update setup.
alter table public.admissions replica identity full;
alter table public.drug_chart_entries replica identity full;
alter table public.vital_signs_entries replica identity full;
alter table public.antenatal_followups replica identity full;
alter table public.antenatal_bookings replica identity full;

alter publication supabase_realtime add table
  public.admissions,
  public.drug_chart_entries,
  public.vital_signs_entries,
  public.antenatal_followups,
  public.antenatal_bookings;
