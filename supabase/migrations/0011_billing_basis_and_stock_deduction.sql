-- 0011 — Per-drug billing basis, verified price/stock flags, and controlled stock deduction.
-- Part A only (safe to run while the current UI is live). The payment/confirmation
-- gates (Part B) ship in 0012 together with the front-end update.
--
-- NOTE: this replaces deduct_pharmacy_stock_on_dispense(), which existed live but was never
-- in the repo migrations. Old behaviour: silent clamp at zero, deducted from unverified stock.

-- ---------- columns ----------
alter table public.inventory
  add column billing_basis text not null default 'per_unit' check (billing_basis in ('per_unit','per_pack')),
  add column price_verified boolean not null default false,
  add column stock_verified boolean not null default false,
  add column oversold_count int not null default 0,
  add column oversold_units int not null default 0;

alter table public.prescriptions
  add column billing_basis text not null default 'per_unit' check (billing_basis in ('per_unit','per_pack')),
  add column proposed_quantity int,
  add column quantity_confirmed boolean not null default false,
  add column quantity_confirmed_by uuid references public.users(id),
  add column quantity_confirmed_at timestamptz,
  add column stock_deducted int not null default 0;

-- existing prescriptions keep their quantity; already-dispensed ones count as confirmed
update public.prescriptions set proposed_quantity = quantity;
update public.prescriptions set quantity_confirmed = true where dispensed;

-- ---------- stock deduction ----------
-- Deducts the BILLED quantity (units for per_unit drugs, packs for per_pack drugs) only
-- from stock that has been marked verified. When verified stock is short, up to 3 dispenses
-- are allowed (stock stays at 0, shortfall recorded); the 4th is blocked until restock.
-- Un-dispensing returns only what was actually taken off the shelf.
create or replace function public.deduct_pharmacy_stock_on_dispense() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare inv record; qty int := greatest(coalesce(NEW.quantity,1),1); inv_id uuid; taken int;
begin
  if NEW.dispensed and not coalesce(OLD.dispensed,false) then
    select id, stock, stock_verified, oversold_count into inv from public.inventory
      where lower(name)=lower(NEW.drug_name) order by id limit 1 for update;
    if found and inv.stock_verified then
      if inv.stock < qty and inv.oversold_count >= 3 then
        raise exception 'Out of stock: % has % in stock but % needed. Restock before dispensing.', NEW.drug_name, inv.stock, qty;
      end if;
      taken := least(inv.stock, qty);
      update public.inventory set stock = stock - taken,
        oversold_count = oversold_count + case when inv.stock < qty then 1 else 0 end,
        oversold_units = oversold_units + (qty - taken),
        last_updated = now() where id = inv.id;
      NEW.stock_deducted := taken;
    end if;
  elsif not NEW.dispensed and coalesce(OLD.dispensed,false) and coalesce(OLD.stock_deducted,0) > 0 then
    select id into inv_id from public.inventory where lower(name)=lower(NEW.drug_name) order by id limit 1;
    update public.inventory set stock = stock + OLD.stock_deducted, last_updated = now() where id = inv_id;
    NEW.stock_deducted := 0;
  end if;
  return NEW;
end $fn$;

drop trigger if exists trg_deduct_pharmacy_stock_on_dispense on public.prescriptions;
create trigger trg_rx_stock_z_deduct before update on public.prescriptions
  for each row execute function public.deduct_pharmacy_stock_on_dispense();

-- restocking (stock going up) resets the oversold counters
create function public.inv_reset_oversold() returns trigger language plpgsql set search_path to 'public' as $fn$
begin
  if NEW.stock > OLD.stock then NEW.oversold_count := 0; NEW.oversold_units := 0; end if;
  return NEW;
end $fn$;
create trigger trg_inv_reset_oversold before update of stock on public.inventory
  for each row execute function public.inv_reset_oversold();
