-- CMD-only: permanently remove a bill together with its payments and the
-- clinical record that holds the bill. Atomic, audited, no-op for other roles.
create or replace function public.cmd_remove_bill(p_item_type text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_desc text;
  v_amount numeric := 0;
  v_pay_count int := 0;
  v_pay_total numeric := 0;
  v_rows int := 0;
  v_patient uuid;
  v_linked int;
begin
  if not public.has_role('CMD'::user_role) then
    raise exception 'Only the CMD can remove bills.' using errcode = '42501';
  end if;
  if p_item_type is null or p_item_id is null then
    raise exception 'Missing bill reference.';
  end if;

  if p_item_type = 'consultation' then
    select patient_id, coalesce(diagnosis,'Clinical Assessment'), coalesce(payment_fee,0)
      into v_patient, v_desc, v_amount from public.medical_records where id = p_item_id for update;
    if not found then raise exception 'That consultation record no longer exists.'; end if;
    select (select count(*) from public.lab_tests where record_id = p_item_id)
         + (select count(*) from public.prescriptions where record_id = p_item_id) into v_linked;
    if v_linked > 0 then
      raise exception 'This consultation has % linked lab test/prescription item(s). Remove those bills first, then remove the consultation.', v_linked;
    end if;
  elsif p_item_type = 'visit' then
    select patient_id, coalesce(diagnosis,'Routine Check-up'), coalesce(billing_amount,0)
      into v_patient, v_desc, v_amount from public.visits where id = p_item_id for update;
    if not found then raise exception 'That visit no longer exists.'; end if;
  elsif p_item_type = 'lab_test' then
    select patient_id, 'Lab Test: ' || test_type, coalesce(price,0)
      into v_patient, v_desc, v_amount from public.lab_tests where id = p_item_id for update;
    if not found then raise exception 'That lab test no longer exists.'; end if;
  elsif p_item_type = 'lab_test_group' then
    select max(patient_id::text)::uuid, 'Lab Tests: ' || string_agg(test_type, ', '), coalesce(sum(price),0)
      into v_patient, v_desc, v_amount from public.lab_tests where record_id = p_item_id;
    if v_desc is null then raise exception 'Those lab tests no longer exist.'; end if;
  elsif p_item_type = 'prescription' then
    select patient_id, 'Prescription: ' || drug_name || ' x' || quantity, coalesce(drug_price * quantity,0)
      into v_patient, v_desc, v_amount from public.prescriptions where id = p_item_id for update;
    if not found then raise exception 'That prescription no longer exists.'; end if;
  elsif p_item_type = 'prescription_group' then
    select max(patient_id::text)::uuid, 'Prescriptions: ' || string_agg(drug_name || ' x' || quantity, ', '), coalesce(sum(drug_price * quantity),0)
      into v_patient, v_desc, v_amount from public.prescriptions where record_id = p_item_id;
    if v_desc is null then raise exception 'Those prescriptions no longer exist.'; end if;
  else
    raise exception 'Unknown bill type: %', p_item_type;
  end if;

  select count(*), coalesce(sum(paid_amount),0) into v_pay_count, v_pay_total
    from public.financials where reference_type = p_item_type and reference_id = p_item_id;

  delete from public.financials where reference_type = p_item_type and reference_id = p_item_id;

  if p_item_type = 'consultation' then delete from public.medical_records where id = p_item_id;
  elsif p_item_type = 'visit' then delete from public.visits where id = p_item_id;
  elsif p_item_type = 'lab_test' then delete from public.lab_tests where id = p_item_id;
  elsif p_item_type = 'lab_test_group' then delete from public.lab_tests where record_id = p_item_id;
  elsif p_item_type = 'prescription' then delete from public.prescriptions where id = p_item_id;
  elsif p_item_type = 'prescription_group' then delete from public.prescriptions where record_id = p_item_id;
  end if;
  get diagnostics v_rows = row_count;

  insert into public.audit_logs (staff_id, action, details)
  values (auth.uid(), 'REMOVE_BILL_COMPLETELY',
    format('Removed %s %s "%s": bill N%s, %s payment(s) totalling N%s, %s record row(s) deleted, patient %s',
      p_item_type, p_item_id, v_desc, v_amount, v_pay_count, v_pay_total, v_rows, v_patient));

  return jsonb_build_object('description', v_desc, 'amount', v_amount,
    'payments_removed', v_pay_count, 'payments_total', v_pay_total, 'records_removed', v_rows);
end $$;

revoke all on function public.cmd_remove_bill(text, uuid) from public, anon;
grant execute on function public.cmd_remove_bill(text, uuid) to authenticated;
