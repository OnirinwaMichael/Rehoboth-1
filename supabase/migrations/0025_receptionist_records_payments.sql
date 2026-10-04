-- 0025 — The Receptionist works as the clinic's accountant, so the Receptionist may record payments.
-- Until now record_item_payment() only accepted Accountant or CMD, and there are no Accountant
-- accounts, so a Receptionist login was refused with "Only Accountant or CMD can record payments".
-- Changed: the role check in record_item_payment() and billing_integrity_report() now also accepts
-- Receptionist. The payment logic itself is unchanged (the ledger trigger still enforces the amount
-- due and the over-payment limit).
-- NOT changed on purpose: clear_pending_payments() — it marks items paid without recording any
-- money, nothing in the app uses it, so it stays CMD/Accountant only.
-- No data is changed by this migration.

create or replace function public.record_item_payment(p_item_type text, p_item_id uuid, p_patient_id text, p_amount_paid numeric, p_payment_method text default null)
returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare v_price numeric; v_prior_paid numeric; v_new_balance numeric; v_new_status text;
begin
  if not (has_role('Receptionist') or has_role('Accountant') or has_role('CMD')) then raise exception 'Only Receptionist, Accountant or CMD can record payments'; end if;
  if p_amount_paid is null or p_amount_paid <= 0 then raise exception 'Amount paid must be greater than zero'; end if;
  if p_item_type = 'consultation' then select payment_fee into v_price from public.medical_records where id = p_item_id;
  elsif p_item_type = 'visit' then select billing_amount into v_price from public.visits where id = p_item_id;
  elsif p_item_type = 'lab_test' then select price into v_price from public.lab_tests where id = p_item_id;
  elsif p_item_type = 'lab_test_group' then select sum(price) into v_price from public.lab_tests where record_id = p_item_id;
  elsif p_item_type = 'prescription' then select drug_price * quantity into v_price from public.prescriptions where id = p_item_id;
  elsif p_item_type = 'prescription_group' then select sum(drug_price * quantity) into v_price from public.prescriptions where record_id = p_item_id;
  else raise exception 'Unknown item_type: %', p_item_type; end if;
  if v_price is null then raise exception 'Billable item not found'; end if;
  select coalesce(sum(paid_amount), 0) into v_prior_paid from public.financials where reference_id = p_item_id and reference_type = p_item_type;
  v_new_balance := v_price - (v_prior_paid + p_amount_paid);
  v_new_status := case when v_new_balance <= 0 then 'paid' else 'partial' end;
  insert into public.financials (patient_id, total_amount, paid_amount, pending_amount, payment_status, payment_method, reference_type, reference_id)
  values (p_patient_id, v_price, p_amount_paid, greatest(v_new_balance, 0),
          case when v_new_status = 'paid' then 'fully paid' else 'partially paid' end, p_payment_method, p_item_type, p_item_id);
end $fn$;

create or replace function public.billing_integrity_report()
returns table(patient_id text, item_type text, item_id uuid, amount numeric, stored_status text, paid numeric, expected_status text)
language sql stable security definer set search_path to 'public' as $fn$
  with pay as (select reference_id, reference_type, sum(paid_amount) paid from public.financials where reference_id is not null group by 1, 2)
  select b.patient_id, b.item_type, b.id, b.amount, b.payment_status, coalesce(p.paid, 0),
         case when coalesce(p.paid, 0) >= b.amount then 'paid' when coalesce(p.paid, 0) > 0 then 'partial' else 'pending' end
  from public.billing_items b
  left join pay p on p.reference_id = b.id and p.reference_type = b.item_type
  where (has_role('Receptionist') or has_role('Accountant') or has_role('CMD'))
    and b.payment_status <> case when coalesce(p.paid, 0) >= b.amount then 'paid' when coalesce(p.paid, 0) > 0 then 'partial' else 'pending' end;
$fn$;
