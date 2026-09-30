-- 0019 — Carry the family member from the consultation onto its prescriptions.
-- The member is recorded on the consultation (medical_records.family_member_id); drugs only
-- pointed at the consultation, so Pharmacy had no way to show who the drugs are for.
-- The copy is made by the database when a prescription is created, and follows any later
-- correction of the consultation's member. Prescriptions without a consultation stay blank.
alter table public.prescriptions
  add column family_member_id uuid references public.family_members(id) on delete set null;

update public.prescriptions p set family_member_id = m.family_member_id
  from public.medical_records m
 where m.id = p.record_id and m.family_member_id is not null;

create function public.rx_copy_family_member() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if NEW.family_member_id is null and NEW.record_id is not null then
    select family_member_id into NEW.family_member_id from public.medical_records where id = NEW.record_id;
  end if;
  return NEW;
end $fn$;
create trigger trg_rx_copy_family_member before insert on public.prescriptions
  for each row execute function public.rx_copy_family_member();

create function public.record_member_to_rx() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  update public.prescriptions set family_member_id = NEW.family_member_id
   where record_id = NEW.id and family_member_id is distinct from NEW.family_member_id;
  return NEW;
end $fn$;
create trigger trg_record_member_to_rx after update of family_member_id on public.medical_records
  for each row execute function public.record_member_to_rx();
