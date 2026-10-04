-- 0022 — Receptionist-recorded payment (full OR part) opens Lab entry and Pharmacy dispensing.
-- Rules, enforced in Postgres so a stale tab or direct API call cannot bypass them:
--  1. Pharmacy: a priced drug can be dispensed once a payment is recorded (status 'partial' or
--     'paid'). Before this it needed 'paid'. A part-paid drug can go out; the balance stays in
--     pending_bills_summary() until collected. Free drugs and the quantity-confirmed rule are unchanged.
--  2. Lab: a priced test cannot get its FIRST result until a payment is recorded. This covers
--     entering a result on a queued test and saving a priced walk-in with a result already on it.
--     Editing a result that already exists is untouched, and so are free tests, so no existing
--     row is affected.
-- Only the receptionist/CMD can record payments (financials RLS), so a recorded payment is the verification.
-- No data is changed by this migration.

create or replace function public.guard_rx_dispense() returns trigger
language plpgsql set search_path to 'public' as $fn$
begin
  if NEW.dispensed and not coalesce(OLD.dispensed, false) then
    if NEW.payment_status not in ('partial', 'paid') and coalesce(NEW.drug_price, 0) * coalesce(NEW.quantity, 1) > 0 then
      raise exception 'The receptionist must record a payment before dispensing (status: %)', NEW.payment_status;
    end if;
    if not NEW.quantity_confirmed then
      raise exception 'Pharmacy must confirm the quantity before dispensing';
    end if;
  end if;
  return NEW;
end $fn$;

create or replace function public.guard_lab_result_payment() returns trigger
language plpgsql set search_path to 'public' as $fn$
declare v_old text;
begin
  v_old := case when TG_OP = 'INSERT' then '' else coalesce(OLD.result, '') end;
  if v_old = '' and coalesce(NEW.result, '') <> ''
     and coalesce(NEW.price, 0) > 0
     and NEW.payment_status not in ('partial', 'paid') then
    raise exception 'The receptionist must record a payment before this lab result can be entered';
  end if;
  return NEW;
end $fn$;

drop trigger if exists trg_lab_result_payment_gate on public.lab_tests;
create trigger trg_lab_result_payment_gate before insert or update on public.lab_tests
  for each row execute function public.guard_lab_result_payment();
