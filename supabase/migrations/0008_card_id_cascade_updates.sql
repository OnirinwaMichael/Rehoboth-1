-- Allow a patient's card_id to be corrected/edited after the fact.
-- Previously every foreign key referencing patients.card_id used
-- NO ACTION on update, so renaming a card ID would fail outright for
-- any patient with existing records (which is most of them). Switch
-- all of them to CASCADE so related records follow automatically.
alter table public.financials drop constraint financials_patient_id_fkey,
  add constraint financials_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete restrict;

alter table public.medical_records drop constraint medical_records_patient_id_fkey,
  add constraint medical_records_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete restrict;

alter table public.visits drop constraint visits_patient_id_fkey,
  add constraint visits_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete restrict;

alter table public.lab_tests drop constraint lab_tests_patient_id_fkey,
  add constraint lab_tests_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete restrict;

alter table public.appointments drop constraint appointments_patient_id_fkey,
  add constraint appointments_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete restrict;

alter table public.patient_allergies drop constraint patient_allergies_patient_id_fkey,
  add constraint patient_allergies_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete cascade;

alter table public.patient_consents drop constraint patient_consents_patient_id_fkey,
  add constraint patient_consents_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete cascade;

alter table public.clinical_letters drop constraint clinical_letters_patient_id_fkey,
  add constraint clinical_letters_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete cascade;

alter table public.prescriptions drop constraint prescriptions_patient_id_fkey,
  add constraint prescriptions_patient_id_fkey foreign key (patient_id)
    references public.patients(card_id) on update cascade on delete cascade;
