-- 0029 — Pay several bills at once (consultation + lab tests + drugs ...) with one receipt.
-- Each service line is still its own payment row tied to its own bill, so every existing rule
-- (ledger trigger, payment gates for dispensing / lab results, refunds, reports) is unchanged.
-- The rows of one combined payment share a receipt_id so the app can show them as one entry.
--
-- Changed:
--   * financials.receipt_id (nullable uuid, indexed). Old payments keep it NULL.
--   * record_combined_payment(patient, method, lines): all-or-nothing; Receptionist / Accountant / CMD.
--     Each line may be a full or partial amount. A line may not exceed its bill's balance, the bill
--     must belong to that patient. Audited as RECORD_COMBINED_PAYMENT.
-- NOT changed: record_item_payment() (single payments), refunds, payment editing rules.
-- Existing data: no rows are touched.

alter table public.financials add column if not exists receipt_id uuid;
create index if not exists idx_financials_receipt on public.financials(receipt_id) where receipt_id is not null;

create or replace function public.record_combined_payment(p_patient_id text, p_payment_method text, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_receipt uuid := gen_random_uuid();
  v_line jsonb; v_type text; v_id uuid; v_amt numeric;
  v_pat text; v_due numeric; v_desc text; v_paid numeric;
  v_total numeric := 0; v_n int := 0;
begin
  if not (has_role('Receptionist') or has_role('Accountant') or has_role('CMD')) then
    raise exception 'Only Receptionist, Accountant or CMD can record payments';
  end if;
  if p_patient_id is null then raise exception 'Missing patient'; end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'bank transfer') then
    raise exception 'Payment method must be cash or bank transfer';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose at least one service to pay for';
  end if;
  if jsonb_array_length(p_lines) > 50 then raise exception 'Too many services in one payment'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_type := v_line->>'item_type';
    v_id := nullif(v_line->>'item_id', '')::uuid;
    v_amt := nullif(v_line->>'amount', '')::numeric;
    if v_type is null or v_id is null then raise exception 'A service line is missing its bill reference'; end if;
    if v_amt is null or v_amt <= 0 then raise exception 'Every amount must be greater than zero'; end if;

    select patient_id, amount, description into v_pat, v_due, v_desc
      from public.billing_items where id = v_id and item_type = v_type;
    if v_pat is null then raise exception 'A bill in this payment no longer exists'; end if;
    if v_pat <> p_patient_id then raise exception 'A bill in this payment belongs to another patient'; end if;

    select coalesce(sum(paid_amount), 0) into v_paid from public.financials
     where reference_id = v_id and reference_type = v_type;
    if v_amt > v_due - v_paid then
      raise exception 'Payment of % for "%" is more than its balance of %', v_amt, v_desc, v_due - v_paid;
    end if;

    -- The ledger trigger recomputes pending amount and status and syncs the bill's status.
    insert into public.financials (patient_id, total_amount, paid_amount, pending_amount, payment_status,
                                   payment_method, reference_type, reference_id, receipt_id)
    values (p_patient_id, v_due, v_amt, 0, 'partially paid', p_payment_method, v_type, v_id, v_receipt);
    v_total := v_total + v_amt; v_n := v_n + 1;
  end loop;

  insert into public.audit_logs (staff_id, action, details)
  values (auth.uid(), 'RECORD_COMBINED_PAYMENT',
    format('Recorded one payment of N%s (%s) covering %s service(s) for patient %s, receipt %s',
           v_total, p_payment_method, v_n, p_patient_id, v_receipt));

  return jsonb_build_object('receipt_id', v_receipt, 'total', v_total, 'services', v_n);
end $fn$;

revoke all on function public.record_combined_payment(text, text, jsonb) from public, anon;
grant execute on function public.record_combined_payment(text, text, jsonb) to authenticated;
