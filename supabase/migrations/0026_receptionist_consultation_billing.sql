-- Narrow fix: let finance roles see consultation billing without opening medical_records.
create or replace function public.consultation_billing_items()
returns table(id uuid, patient_id text, description text, amount numeric, payment_status text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select mr.id, mr.patient_id,
         case when public.current_staff_role() = 'Receptionist'::user_role then 'Consultation'::text
              else coalesce(mr.diagnosis, 'Clinical Assessment') end,
         mr.payment_fee, mr.payment_status, mr.created_at
    from public.medical_records mr
   where mr.payment_fee > 0
     and public.current_staff_role() in ('CMD'::user_role, 'Receptionist'::user_role, 'Accountant'::user_role);
$fn$;

revoke all on function public.consultation_billing_items() from public, anon;
grant execute on function public.consultation_billing_items() to authenticated, service_role;

create or replace view public.billing_items with (security_invoker = true) as
select mr.id, mr.patient_id, 'consultation'::text as item_type,
       coalesce(mr.diagnosis, 'Clinical Assessment'::text) as description,
       mr.payment_fee as amount, mr.payment_status, mr.created_at
  from public.medical_records mr
 where mr.payment_fee > 0::numeric
   and coalesce(public.current_staff_role() not in ('CMD'::user_role, 'Receptionist'::user_role, 'Accountant'::user_role), true)
union all
select f.id, f.patient_id, 'consultation'::text, f.description, f.amount, f.payment_status, f.created_at
  from public.consultation_billing_items() f
union all
select visits.id, visits.patient_id, 'visit'::text, coalesce(visits.diagnosis, 'Routine Check-up'::text),
       visits.billing_amount, visits.payment_status, visits."timestamp"
  from visits where visits.billing_amount > 0::numeric
union all
select lab_tests.record_id, lab_tests.patient_id, 'lab_test_group'::text,
       'Lab Tests: '::text || string_agg(lab_tests.test_type, ', '::text order by lab_tests.created_at),
       sum(lab_tests.price),
       case when bool_and(lab_tests.payment_status = 'paid'::text) then 'paid'::text
            when bool_or(lab_tests.payment_status = any (array['paid'::text, 'partial'::text])) then 'partial'::text
            else 'pending'::text end,
       min(lab_tests.created_at)
  from lab_tests where lab_tests.price > 0::numeric and lab_tests.record_id is not null
 group by lab_tests.record_id, lab_tests.patient_id
union all
select lab_tests.id, lab_tests.patient_id, 'lab_test'::text, 'Lab Test: '::text || lab_tests.test_type,
       lab_tests.price, lab_tests.payment_status, lab_tests.created_at
  from lab_tests where lab_tests.price > 0::numeric and lab_tests.record_id is null
union all
select prescriptions.record_id, prescriptions.patient_id, 'prescription_group'::text,
       'Prescriptions: '::text || string_agg((prescriptions.drug_name || ' x'::text) || prescriptions.quantity, ', '::text order by prescriptions.created_at),
       sum(prescriptions.drug_price * prescriptions.quantity::numeric),
       case when bool_and(prescriptions.payment_status = 'paid'::text) then 'paid'::text
            when bool_or(prescriptions.payment_status = any (array['paid'::text, 'partial'::text])) then 'partial'::text
            else 'pending'::text end,
       min(prescriptions.created_at)
  from prescriptions where prescriptions.drug_price > 0::numeric and prescriptions.record_id is not null
 group by prescriptions.record_id, prescriptions.patient_id
union all
select prescriptions.id, prescriptions.patient_id, 'prescription'::text,
       (('Prescription: '::text || prescriptions.drug_name) || ' x'::text) || prescriptions.quantity,
       prescriptions.drug_price * prescriptions.quantity::numeric, prescriptions.payment_status, prescriptions.created_at
  from prescriptions where prescriptions.drug_price > 0::numeric and prescriptions.record_id is null;
