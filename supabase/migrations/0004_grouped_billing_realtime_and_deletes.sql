-- Restrict deletion to CMD only, everywhere it wasn't already.
drop policy if exists "expenses_delete_finance" on public.expenses;
create policy "expenses_delete_cmd" on public.expenses
  for delete using (has_role('CMD'));

drop policy if exists "prescriptions_delete_author_or_cmd" on public.prescriptions;
create policy "prescriptions_delete_cmd" on public.prescriptions
  for delete using (has_role('CMD'));

-- Fix realtime: no table was actually publishing changes, so every
-- .on('postgres_changes', ...) subscription in the app was a silent
-- no-op. Full replica identity is needed for filtered subscriptions
-- (e.g. filter: patient_id=eq.X) to see the old row on UPDATE/DELETE.
alter table public.expenses replica identity full;
alter table public.financials replica identity full;
alter table public.lab_tests replica identity full;
alter table public.prescriptions replica identity full;
alter table public.clinical_letters replica identity full;
alter table public.medical_records replica identity full;
alter table public.visits replica identity full;

alter publication supabase_realtime add table
  public.expenses,
  public.financials,
  public.lab_tests,
  public.prescriptions,
  public.clinical_letters,
  public.medical_records,
  public.visits;

-- Group multiple tests (and multiple prescriptions) from the same
-- encounter into ONE payable line item, instead of the Accountant
-- clicking Pay per individual test/drug. Tests/drugs entered without
-- a record_id (e.g. Lab's own manual walk-in entry) stay as
-- individual items, since they weren't part of a batch recommendation.
create or replace view public.billing_items with (security_invoker = true) as
  select id, patient_id, 'consultation'::text as item_type,
    coalesce(diagnosis, 'Clinical Assessment') as description,
    payment_fee as amount, payment_status, created_at
  from public.medical_records where payment_fee > 0

  union all
  select id, patient_id, 'visit'::text,
    coalesce(diagnosis, 'Routine Check-up'),
    billing_amount, payment_status, timestamp
  from public.visits where billing_amount > 0

  union all
  select record_id as id, patient_id, 'lab_test_group'::text,
    'Lab Tests: ' || string_agg(test_type, ', ' order by created_at),
    sum(price),
    case
      when bool_and(payment_status = 'paid') then 'paid'
      when bool_or(payment_status in ('paid','partial')) then 'partial'
      else 'pending'
    end,
    min(created_at)
  from public.lab_tests
  where price > 0 and record_id is not null
  group by record_id, patient_id

  union all
  select id, patient_id, 'lab_test'::text,
    'Lab Test: ' || test_type,
    price, payment_status, created_at
  from public.lab_tests
  where price > 0 and record_id is null

  union all
  select record_id as id, patient_id, 'prescription_group'::text,
    'Prescriptions: ' || string_agg(drug_name || ' x' || quantity, ', ' order by created_at),
    sum(drug_price * quantity),
    case
      when bool_and(payment_status = 'paid') then 'paid'
      when bool_or(payment_status in ('paid','partial')) then 'partial'
      else 'pending'
    end,
    min(created_at)
  from public.prescriptions
  where drug_price > 0 and record_id is not null
  group by record_id, patient_id

  union all
  select id, patient_id, 'prescription'::text,
    'Prescription: ' || drug_name || ' x' || quantity,
    drug_price * quantity, payment_status, created_at
  from public.prescriptions
  where drug_price > 0 and record_id is null;

-- Extend record_item_payment to handle the two new grouped item
-- types: pay/partial-pay the whole batch in one action, and cascade
-- the resulting status to every test/prescription in it.
create or replace function public.record_item_payment(
  p_item_type text,
  p_item_id uuid,
  p_patient_id text,
  p_amount_paid numeric,
  p_payment_method text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_price numeric;
  v_prior_paid numeric;
  v_new_balance numeric;
  v_new_status text;
begin
  if not (has_role('Accountant') or has_role('CMD')) then
    raise exception 'Only Accountant or CMD can record payments';
  end if;
  if p_amount_paid is null or p_amount_paid <= 0 then
    raise exception 'Amount paid must be greater than zero';
  end if;

  if p_item_type = 'consultation' then
    select payment_fee into v_price from public.medical_records where id = p_item_id;
  elsif p_item_type = 'visit' then
    select billing_amount into v_price from public.visits where id = p_item_id;
  elsif p_item_type = 'lab_test' then
    select price into v_price from public.lab_tests where id = p_item_id;
  elsif p_item_type = 'lab_test_group' then
    select sum(price) into v_price from public.lab_tests where record_id = p_item_id;
  elsif p_item_type = 'prescription' then
    select drug_price * quantity into v_price from public.prescriptions where id = p_item_id;
  elsif p_item_type = 'prescription_group' then
    select sum(drug_price * quantity) into v_price from public.prescriptions where record_id = p_item_id;
  else
    raise exception 'Unknown item_type: %', p_item_type;
  end if;

  if v_price is null then
    raise exception 'Billable item not found';
  end if;

  select coalesce(sum(paid_amount), 0) into v_prior_paid
    from public.financials where reference_id = p_item_id and reference_type = p_item_type;

  v_new_balance := v_price - (v_prior_paid + p_amount_paid);
  v_new_status := case when v_new_balance <= 0 then 'paid' else 'partial' end;

  insert into public.financials (
    patient_id, total_amount, paid_amount, pending_amount,
    payment_status, payment_method, reference_type, reference_id
  ) values (
    p_patient_id, v_price, p_amount_paid, greatest(v_new_balance, 0),
    case when v_new_status = 'paid' then 'fully paid' else 'partially paid' end,
    p_payment_method, p_item_type, p_item_id
  );

  if p_item_type = 'consultation' then
    update public.medical_records set payment_status = v_new_status where id = p_item_id;
  elsif p_item_type = 'visit' then
    update public.visits set payment_status = v_new_status where id = p_item_id;
  elsif p_item_type = 'lab_test' then
    update public.lab_tests set payment_status = v_new_status where id = p_item_id;
  elsif p_item_type = 'lab_test_group' then
    update public.lab_tests set payment_status = v_new_status where record_id = p_item_id;
  elsif p_item_type = 'prescription' then
    update public.prescriptions set payment_status = v_new_status where id = p_item_id;
  elsif p_item_type = 'prescription_group' then
    update public.prescriptions set payment_status = v_new_status where record_id = p_item_id;
  end if;
end;
$$;

revoke execute on function public.record_item_payment(text, uuid, text, numeric, text) from anon;
revoke execute on function public.record_item_payment(text, uuid, text, numeric, text) from public;
grant execute on function public.record_item_payment(text, uuid, text, numeric, text) to authenticated;
