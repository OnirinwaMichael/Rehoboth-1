-- 0023 — Walk-in patients: a person with no clinic card can be recorded so their tests and
-- other charges show up in Finance > Pending Bills like any other patient's.
-- Lab, Receptionist and CMD may add one through create_walkin_patient(); patients INSERT
-- policy is NOT loosened (it stays Receptionist/CMD only), the function does the insert.
-- A walk-in gets card_id WALKIN-0001, WALKIN-0002, ... from its own sequence (the normal
-- card-number sequence is untouched), category 'walk-in', and no registration fee.
-- No existing row is changed.

create sequence if not exists public.walkin_card_seq;

create or replace function public.create_walkin_patient(
  p_name text, p_gender text, p_phone text default null, p_age text default null
) returns text
language plpgsql security definer set search_path to 'public' as $fn$
declare v_role user_role; v_id text;
begin
  v_role := public.current_staff_role();
  if v_role is null or v_role not in ('CMD', 'Receptionist', 'Lab') then
    raise exception 'Only Lab, Receptionist or CMD can add a walk-in patient';
  end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Walk-in name is required'; end if;
  if p_gender is null or p_gender not in ('male', 'female') then raise exception 'Gender must be male or female'; end if;
  v_id := 'WALKIN-' || lpad(nextval('public.walkin_card_seq')::text, 4, '0');
  insert into public.patients (card_id, name, gender, phone, age, category, registration_type)
  values (v_id, btrim(p_name), p_gender,
          nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_age, '')), ''),
          'walk-in', 'fresh');
  return v_id;
end $fn$;

revoke all on function public.create_walkin_patient(text, text, text, text) from public, anon;
grant execute on function public.create_walkin_patient(text, text, text, text) to authenticated;
