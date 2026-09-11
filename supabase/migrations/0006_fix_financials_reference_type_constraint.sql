-- Bug fix: the grouped billing types (lab_test_group, prescription_group)
-- added in migration 0004 were never added to this constraint, so
-- every payment against a grouped test/prescription batch violated it
-- and the whole record_item_payment transaction silently rolled back -
-- the Accountant's Pay button appeared to do nothing.
alter table public.financials drop constraint financials_reference_type_check;
alter table public.financials add constraint financials_reference_type_check
  check (reference_type = any (array['consultation','visit','lab_test','lab_test_group','prescription','prescription_group']));
