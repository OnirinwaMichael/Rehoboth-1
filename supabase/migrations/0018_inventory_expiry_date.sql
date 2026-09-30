-- 0018 — Expiry date on drug inventory stock.
-- One date per drug row = the expiry of the stock currently on the shelf (use the earliest
-- date if batches differ, and update it when a new batch is received). Nothing is back-filled:
-- drugs with no date simply show "not recorded" and are never blocked.
-- Dispensing is blocked once the recorded date has passed (Lagos date; the last valid day is
-- the expiry date itself).
alter table public.inventory add column expiry_date date;

create or replace function public.guard_rx_dispense() returns trigger
language plpgsql set search_path to 'public' as $fn$
declare v_exp date;
begin
  if NEW.dispensed and not coalesce(OLD.dispensed, false) then
    if NEW.payment_status <> 'paid' and coalesce(NEW.drug_price, 0) * coalesce(NEW.quantity, 1) > 0 then
      raise exception 'Payment must be completed before dispensing (status: %)', NEW.payment_status;
    end if;
    if not NEW.quantity_confirmed then
      raise exception 'Pharmacy must confirm the quantity before dispensing';
    end if;
    select expiry_date into v_exp from public.inventory
      where lower(name) = lower(NEW.drug_name) order by id limit 1;
    if v_exp is not null and v_exp < (now() at time zone 'Africa/Lagos')::date then
      raise exception '% expired on %. Update the stock expiry date to the batch being dispensed, or remove the expired stock.', NEW.drug_name, to_char(v_exp, 'DD Mon YYYY');
    end if;
  end if;
  return NEW;
end $fn$;
