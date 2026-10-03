-- 0020 — pending_bills_summary(): one row per patient with unpaid items.
-- Already applied live (version 20261002080215); this file records it in the repo.
-- Reads billing_items, so unpaid items with no payment recorded yet are included
-- (the old Finance list only looked at recorded payments). Runs as the caller,
-- so row-level security still applies.
CREATE OR REPLACE FUNCTION public.pending_bills_summary()
 RETURNS TABLE(patient_id text, patient_name text, family_member_names text, item_count integer, total_amount numeric, paid_amount numeric, outstanding numeric, oldest_at timestamp with time zone, kinds text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with paid as (
    select reference_id, reference_type, sum(paid_amount) as p
      from public.financials where reference_id is not null group by 1, 2
  ), items as (
    select b.id, b.patient_id, b.item_type, b.amount, b.created_at, coalesce(p.p, 0) as paid
      from public.billing_items b
      left join paid p on p.reference_id = b.id and p.reference_type = b.item_type
     where b.payment_status <> 'paid' and b.amount > 0
  )
  select i.patient_id, pt.name,
         (select string_agg(distinct fm.name, ', ')
            from public.medical_records mr join public.family_members fm on fm.id = mr.family_member_id
           where mr.patient_id = i.patient_id and mr.id in (select id from items x where x.patient_id = i.patient_id)),
         count(*)::int, sum(i.amount), sum(i.paid), sum(i.amount - i.paid), min(i.created_at),
         string_agg(distinct case i.item_type
           when 'consultation' then 'Consultation'
           when 'lab_test_group' then 'Lab tests' when 'lab_test' then 'Lab tests'
           when 'prescription_group' then 'Prescriptions' when 'prescription' then 'Prescriptions'
           when 'visit' then 'Visit' else i.item_type end, ', ')
    from items i join public.patients pt on pt.card_id = i.patient_id
   group by i.patient_id, pt.name
   order by min(i.created_at)
$function$;
