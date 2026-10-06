-- 0031 — Put back stock that test prescriptions had taken before the 5 Oct test-data clear.
-- Deleting a dispensed prescription never returned its stock. The clear on 2026-10-05 deleted
-- 16 prescriptions; only two were for stock-verified drugs (the only drugs that deduct stock):
--   Vitamin C Tab 100mg       x36  dispensed 2026-10-04 22:59 (patient 212/007)  3964 -> 4000
--   Paracetamol Caplet 500mg  x42  dispensed 2026-10-04 22:59 (patient 212/007)   916 ->  958
-- The Paracetamol deduction for patient 3234 (prescription still on file, stock_deducted = 42) is
-- left in place, so only the deleted test dispense is added back.
-- Each update is guarded: it only runs if the stock still equals the number seen when this was
-- written, so it can never be applied twice or on top of a later stock count.
do $$
declare v_n int;
begin
  update public.inventory set stock = stock + 36, last_updated = now()
   where name = 'Vitamin C Tab 100mg' and stock_verified and stock = 3964;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    insert into public.audit_logs (staff_id, action, details)
    values (auth.uid(), 'RESTORE_STOCK', 'Restored 36 x Vitamin C Tab 100mg (3964 -> 4000): stock taken by a test prescription deleted in the 5 Oct clear');
  end if;

  update public.inventory set stock = stock + 42, last_updated = now()
   where name = 'Paracetamol Caplet 500mg' and stock_verified and stock = 916;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    insert into public.audit_logs (staff_id, action, details)
    values (auth.uid(), 'RESTORE_STOCK', 'Restored 42 x Paracetamol Caplet 500mg (916 -> 958): stock taken by a test prescription deleted in the 5 Oct clear');
  end if;
end $$;
