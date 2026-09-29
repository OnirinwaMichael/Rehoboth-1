-- 0012 — Billing gates (Part B). Ships together with the front-end update.
-- Rules enforced in Postgres so no client can bypass them:
--  1. Billing basis is copied from inventory when a prescription is created; per-pack drugs
--     start at quantity 1. Every prescription starts UNCONFIRMED.
--  2. Only Pharmacy (or CMD) can confirm a quantity; who/when is recorded.
--  3. Payment can only be recorded on a prescription whose quantity is confirmed.
--  4. Quantity, price and billing basis lock once any payment exists or the drug is dispensed.
--  5. Dispensing requires full payment and a confirmed quantity (payment, then dispensing).

create function public.rx_apply_billing_basis() returns trigger
language plpgsql set search_path to 'public' as $fn$
declare v_basis text;
begin
  select billing_basis into v_basis from public.inventory
    where lower(name) = lower(NEW.drug_name) order by id limit 1;
  NEW.billing_basis := coalesce(v_basis, 'per_unit');
  if NEW.billing_basis = 'per_pack' then NEW.quantity := 1; end if;
  NEW.proposed_quantity := NEW.quantity;
  NEW.quantity_confirmed := false;
  NEW.quantity_confirmed_by := null;
  NEW.quantity_confirmed_at := null;
  return NEW;
end $fn$;
create trigger trg_rx_apply_basis before insert on public.prescriptions
  for each row execute function public.rx_apply_billing_basis();

create function public.guard_rx_confirm() returns trigger
language plpgsql set search_path to 'public' as $fn$
begin
  if NEW.quantity_confirmed and not OLD.quantity_confirmed then
    if not (public.has_role('Pharmacy') or public.has_role('CMD')) then
      raise exception 'Only Pharmacy or CMD can confirm a prescription quantity';
    end if;
    if NEW.quantity < 1 then raise exception 'Quantity must be at least 1'; end if;
    NEW.quantity_confirmed_by := auth.uid();
    NEW.quantity_confirmed_at := now();
  elsif OLD.quantity_confirmed and not NEW.quantity_confirmed
        and (OLD.payment_status <> 'pending' or OLD.dispensed) then
    raise exception 'Cannot un-confirm a quantity after payment or dispensing';
  end if;
  return NEW;
end $fn$;
create trigger trg_rx_gate_confirm before update on public.prescriptions
  for each row execute function public.guard_rx_confirm();

create function public.guard_rx_quantity_lock() returns trigger
language plpgsql set search_path to 'public' as $fn$
begin
  if (NEW.quantity is distinct from OLD.quantity or NEW.drug_price is distinct from OLD.drug_price
      or NEW.billing_basis is distinct from OLD.billing_basis)
     and (OLD.payment_status <> 'pending' or OLD.dispensed) then
    raise exception 'Quantity, price and billing basis are locked once a payment is recorded or the drug is dispensed';
  end if;
  return NEW;
end $fn$;
create trigger trg_rx_gate_quantity_lock before update on public.prescriptions
  for each row execute function public.guard_rx_quantity_lock();

create function public.guard_rx_dispense() returns trigger
language plpgsql set search_path to 'public' as $fn$
begin
  if NEW.dispensed and not coalesce(OLD.dispensed, false) then
    if NEW.payment_status <> 'paid' and coalesce(NEW.drug_price, 0) * coalesce(NEW.quantity, 1) > 0 then
      raise exception 'Payment must be completed before dispensing (status: %)', NEW.payment_status;
    end if;
    if not NEW.quantity_confirmed then
      raise exception 'Pharmacy must confirm the quantity before dispensing';
    end if;
  end if;
  return NEW;
end $fn$;
create trigger trg_rx_gate_dispense before update on public.prescriptions
  for each row execute function public.guard_rx_dispense();

-- payment gate: same ledger checks as before, plus "quantity must be confirmed"
create or replace function public.financials_enforce_ledger() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare v_due numeric; v_prior numeric; v_cum numeric;
begin
  if new.reference_id is null then return new; end if;
  if new.reference_type is null or new.reference_type = 'registration' then
    raise exception 'A payment tied to an item must carry its item type';
  end if;
  select amount into v_due from public.billing_items where id = new.reference_id and item_type = new.reference_type;
  if v_due is null then raise exception 'Billable item not found for this payment'; end if;
  if new.reference_type = 'prescription' and exists
       (select 1 from public.prescriptions where id = new.reference_id and not quantity_confirmed) then
    raise exception 'Pharmacy must confirm the drug quantity before payment can be recorded';
  elsif new.reference_type = 'prescription_group' and exists
       (select 1 from public.prescriptions where record_id = new.reference_id and not quantity_confirmed) then
    raise exception 'Pharmacy must confirm all drug quantities on this visit before payment can be recorded';
  end if;
  if new.total_amount <> v_due then
    raise exception 'Payment total (%) does not match the amount due (%)', new.total_amount, v_due;
  end if;
  select coalesce(sum(paid_amount), 0) into v_prior from public.financials
   where reference_id = new.reference_id and reference_type = new.reference_type;
  v_cum := v_prior + new.paid_amount;
  if v_cum > v_due then
    raise exception 'Payment of % exceeds the outstanding balance of %', new.paid_amount, v_due - v_prior;
  end if;
  new.pending_amount := v_due - v_cum;
  new.payment_status := case when v_cum >= v_due then 'fully paid' else 'partially paid' end;
  return new;
end $fn$;
