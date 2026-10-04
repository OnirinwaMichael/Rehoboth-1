-- 0024 — Payment no longer waits for Pharmacy to confirm drug quantities.
-- Removes only the two "Pharmacy must confirm ... before payment can be recorded" checks from
-- financials_enforce_ledger(). Everything else in it is unchanged: the item type is required,
-- the payment total must equal the amount due, a payment cannot exceed the outstanding balance,
-- and the pending amount / status are computed here.
-- Consequence (by design of the existing quantity lock, migration 0012): once ANY payment is
-- recorded on a drug, its quantity, price and billing basis lock, so Pharmacy can still confirm
-- the quantity (before dispensing) but can no longer change it after payment.
-- No data is changed by this migration.

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
