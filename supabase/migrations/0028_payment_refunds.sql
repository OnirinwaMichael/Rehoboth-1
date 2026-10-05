-- 0028 — Refunds. A refund is a NEGATIVE payment row in public.financials, so every total that
-- sums paid_amount (revenue, today's collection, reports) nets it out, and the existing triggers
-- recompute the bill's status from its payments (fully refunded -> pending again).
--
-- Changed:
--   * financials.refund_reason (nullable text) + a CHECK that a negative payment must carry a reason.
--   * record_item_refund(): Receptionist / Accountant / CMD may refund; reason required; amount can
--     not exceed what is still paid on that bill; refused once the drug is dispensed or the lab
--     result is entered (the service was delivered). Audited as REFUND_PAYMENT.
-- NOT changed: payment rows still cannot be edited; only the CMD can delete a row (that deletes a
-- refund too, which puts the original payment back in force).
-- Existing data: 3 payment rows, none negative; the new CHECK is satisfied by all of them.

alter table public.financials add column if not exists refund_reason text;

alter table public.financials drop constraint if exists financials_refund_has_reason;
alter table public.financials add constraint financials_refund_has_reason
  check (paid_amount >= 0 or nullif(btrim(refund_reason), '') is not null);

create or replace function public.record_item_refund(
  p_item_type text, p_item_id uuid, p_patient_id text, p_amount numeric, p_payment_method text, p_reason text)
returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_patient text; v_due numeric; v_net numeric; v_desc text; v_delivered boolean := false;
begin
  if not (has_role('Receptionist') or has_role('Accountant') or has_role('CMD')) then
    raise exception 'Only Receptionist, Accountant or CMD can refund payments';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Refund amount must be greater than zero'; end if;
  if char_length(v_reason) < 3 then raise exception 'Give a reason for the refund'; end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'bank transfer') then
    raise exception 'Refund method must be cash or bank transfer';
  end if;
  if p_item_type is null then raise exception 'Missing bill type'; end if;

  perform pg_advisory_xact_lock(hashtext('refund:' || p_item_type || ':' || coalesce(p_item_id::text, p_patient_id, '')));

  if p_item_type = 'registration' then
    if p_patient_id is null then raise exception 'Missing patient'; end if;
    v_patient := p_patient_id;
    select coalesce(sum(paid_amount), 0) into v_net from public.financials
     where reference_type = 'registration' and patient_id = v_patient;
    select total_amount into v_due from public.financials
     where reference_type = 'registration' and patient_id = v_patient and paid_amount > 0
     order by created_at desc limit 1;
    v_desc := 'Registration';
  else
    if p_item_id is null then raise exception 'Missing bill reference'; end if;
    select patient_id, amount, description into v_patient, v_due, v_desc
      from public.billing_items where id = p_item_id and item_type = p_item_type;
    if v_patient is null then raise exception 'That bill no longer exists'; end if;
    select coalesce(sum(paid_amount), 0) into v_net from public.financials
     where reference_type = p_item_type and reference_id = p_item_id;

    if p_item_type = 'prescription' then
      select exists (select 1 from public.prescriptions where id = p_item_id and dispensed) into v_delivered;
    elsif p_item_type = 'prescription_group' then
      select exists (select 1 from public.prescriptions where record_id = p_item_id and dispensed) into v_delivered;
    elsif p_item_type = 'lab_test' then
      select exists (select 1 from public.lab_tests where id = p_item_id and coalesce(result, '') <> '') into v_delivered;
    elsif p_item_type = 'lab_test_group' then
      select exists (select 1 from public.lab_tests where record_id = p_item_id and coalesce(result, '') <> '') into v_delivered;
    end if;
    if v_delivered then
      raise exception 'This was already delivered (drug dispensed or lab result entered), so it cannot be refunded here';
    end if;
  end if;

  if v_net <= 0 then raise exception 'Nothing is paid on this bill, so there is nothing to refund'; end if;
  if p_amount > v_net then
    raise exception 'Refund of % is more than the % paid on this bill', p_amount, v_net;
  end if;

  insert into public.financials (patient_id, total_amount, paid_amount, pending_amount, payment_status,
                                 payment_method, reference_type, reference_id, refund_reason)
  values (v_patient, coalesce(v_due, 0), -p_amount, 0, 'partially paid',
          p_payment_method, p_item_type, p_item_id, v_reason);

  insert into public.audit_logs (staff_id, action, details)
  values (auth.uid(), 'REFUND_PAYMENT',
    format('Refunded N%s (%s) on %s "%s" for patient %s. Reason: %s. Paid on this bill after refund: N%s',
           p_amount, p_payment_method, p_item_type, v_desc, v_patient, v_reason, v_net - p_amount));

  return jsonb_build_object('description', v_desc, 'refunded', p_amount, 'paid_after', v_net - p_amount);
end $fn$;

revoke all on function public.record_item_refund(text, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.record_item_refund(text, uuid, text, numeric, text, text) to authenticated;
