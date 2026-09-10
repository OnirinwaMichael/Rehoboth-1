-- Structured dosage instructions per prescribed drug, so Pharmacy
-- knows exactly how the patient should take/receive it, instead of
-- a bare drug name and quantity. Also adds a route so injections
-- (already stockable in inventory) can be explicitly prescribed as
-- such rather than assumed oral.
alter table public.prescriptions
  add column if not exists dosage_morning integer not null default 0 check (dosage_morning >= 0),
  add column if not exists dosage_afternoon integer not null default 0 check (dosage_afternoon >= 0),
  add column if not exists dosage_night integer not null default 0 check (dosage_night >= 0),
  add column if not exists duration_days integer not null default 1 check (duration_days > 0),
  add column if not exists route text not null default 'Oral'
    check (route in ('Oral','Injection','Topical','IV','Other')),
  add column if not exists instructions text;

comment on column public.prescriptions.dosage_morning is 'Units to take in the morning';
comment on column public.prescriptions.dosage_afternoon is 'Units to take in the afternoon';
comment on column public.prescriptions.dosage_night is 'Units to take at night';
comment on column public.prescriptions.duration_days is 'Number of days the course runs';
comment on column public.prescriptions.route is 'How the drug is administered';
comment on column public.prescriptions.instructions is 'Free-text additional instructions from the prescriber';

-- Per-drug dispense tracking (the old medical_records/visits dispensed
-- flag was whole-encounter, not per-drug — Pharmacy needs to work
-- drug-by-drug here).
alter table public.prescriptions
  add column if not exists dispensed boolean not null default false,
  add column if not exists dispensed_at timestamptz,
  add column if not exists dispensed_by uuid references public.users(id);

-- Pharmacy (and CMD) can mark items dispensed.
create policy "prescriptions_update_pharmacy" on public.prescriptions
  for update using (
    current_staff_role() = any (array['CMD','Pharmacy']::user_role[])
  );
