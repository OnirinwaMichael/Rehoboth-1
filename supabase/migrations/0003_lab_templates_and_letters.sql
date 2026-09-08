-- Rehoboth Clinic HMS — structured lab report templates + letterhead
-- Adds: basic lab request fields, fixed comprehensive report panels,
-- and a clinical_letters table for the diagnosis/referral letterhead.
-- Additive only — existing lab_tests rows/columns are untouched, so
-- historical free-form results keep rendering exactly as before.

-- ============================================================
-- lab_tests: add structured template columns
-- ============================================================
alter table public.lab_tests
  add column if not exists report_type text not null default 'legacy'
    check (report_type in ('legacy', 'basic', 'comprehensive')),
  add column if not exists request_details jsonb,
  add column if not exists panel_results jsonb;

comment on column public.lab_tests.report_type is
  'legacy = old free-form grid, basic = Lab Request Form template, comprehensive = full multi-panel report template';
comment on column public.lab_tests.request_details is
  'Fields from the Basic Lab Request Form: hospitalClinic, ward, no, clinicalHistory, consultant, provisionalDiagnosis, natureOfSpecimen';
comment on column public.lab_tests.panel_results is
  'Fixed-field values from the Comprehensive Lab Report template panels (haematology, widal, urinalysis, parasitology, semenAnalysis, biochemistry, cultureMicroscopy, bloodTransfusion, sensitivity)';

-- ============================================================
-- clinical_letters: diagnosis entries + patient referrals on the
-- clinic letterhead. Written by clinical staff, viewable by all
-- authenticated roles (matches lab_tests read policy).
-- ============================================================
create table public.clinical_letters (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete cascade,
  staff_id uuid not null references public.users(id),
  letter_type text not null check (letter_type in ('diagnosis', 'referral')),
  your_ref text,
  our_ref text,
  referred_to text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clinical_letters_patient on public.clinical_letters(patient_id);

alter table public.clinical_letters enable row level security;

create policy "letters_select_authenticated" on public.clinical_letters
  for select using (auth.uid() is not null);
create policy "letters_insert_clinical" on public.clinical_letters
  for insert with check (public.has_role('Doctor') or public.has_role('Nurse') or public.is_admin());
create policy "letters_update_author_or_admin" on public.clinical_letters
  for update using (staff_id = auth.uid() or public.is_admin());
create policy "letters_delete_admin_only" on public.clinical_letters
  for delete using (public.is_admin());
