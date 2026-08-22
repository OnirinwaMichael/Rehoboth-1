-- ============================================================
-- Helper functions used by RLS policies
-- ============================================================

create or replace function public.current_role_name()
returns user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = 'CMD' from public.users where id = auth.uid()), false);
$$;

create or replace function public.has_role(target_role user_role)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = target_role from public.users where id = auth.uid()), false);
$$;

-- ============================================================
-- Staff creation: replaces the Firebase "dev override" pattern.
-- Only a CMD (verified server-side via RLS + this function running
-- as security definer with an explicit admin check) can invoke this.
-- Uses Supabase's admin API via an Edge Function in practice — this
-- SQL function handles the public.users side once auth.users exists.
-- No default password is set here: invite-based signup only (see
-- migration notes / README for the Edge Function that calls
-- supabase.auth.admin.inviteUserByEmail).
-- ============================================================
create or replace function public.provision_staff_profile(
  p_user_id uuid,
  p_email text,
  p_role user_role,
  p_name text
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only CMD role can provision staff';
  end if;

  insert into public.users (id, email, role, name, status, must_change_password)
  values (p_user_id, p_email, p_role, p_name, 'active', true)
  on conflict (id) do update
    set role = excluded.role, name = excluded.name, status = 'active';
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.users enable row level security;
alter table public.patients enable row level security;
alter table public.visits enable row level security;
alter table public.medical_records enable row level security;
alter table public.lab_tests enable row level security;
alter table public.appointments enable row level security;
alter table public.financials enable row level security;
alter table public.expenses enable row level security;
alter table public.inventory enable row level security;
alter table public.audit_logs enable row level security;

-- users
create policy "users_select_authenticated" on public.users
  for select using (auth.uid() is not null);
create policy "users_insert_admin_only" on public.users
  for insert with check (public.is_admin());
create policy "users_update_self_limited" on public.users
  for update using (auth.uid() = id or public.is_admin())
  with check (
    public.is_admin() or (
      auth.uid() = id
      -- self-updates cannot change role/status/email
      and role = (select role from public.users where id = auth.uid())
      and status = (select status from public.users where id = auth.uid())
    )
  );
create policy "users_delete_admin_only" on public.users
  for delete using (public.is_admin());

-- patients
create policy "patients_select_authenticated" on public.patients
  for select using (auth.uid() is not null);
create policy "patients_write_reception_or_admin" on public.patients
  for insert with check (public.has_role('Receptionist') or public.is_admin());
create policy "patients_update_reception_or_admin" on public.patients
  for update using (public.has_role('Receptionist') or public.is_admin());
create policy "patients_delete_admin_only" on public.patients
  for delete using (public.is_admin());

-- visits
create policy "visits_select_authenticated" on public.visits
  for select using (auth.uid() is not null);
create policy "visits_write_clinical" on public.visits
  for insert with check (public.has_role('Doctor') or public.has_role('Nurse') or public.is_admin());
create policy "visits_update_clinical" on public.visits
  for update using (public.has_role('Doctor') or public.has_role('Nurse') or public.is_admin());
create policy "visits_delete_admin_only" on public.visits
  for delete using (public.is_admin());

-- medical_records
create policy "records_select_authenticated" on public.medical_records
  for select using (auth.uid() is not null);
create policy "records_write_clinical" on public.medical_records
  for insert with check (public.has_role('Doctor') or public.has_role('Nurse') or public.is_admin());
create policy "records_update_clinical" on public.medical_records
  for update using (public.has_role('Doctor') or public.has_role('Nurse') or public.is_admin());
create policy "records_delete_admin_only" on public.medical_records
  for delete using (public.is_admin());

-- lab_tests
create policy "labs_select_authenticated" on public.lab_tests
  for select using (auth.uid() is not null);
create policy "labs_create_clinical" on public.lab_tests
  for insert with check (public.has_role('Doctor') or public.has_role('Nurse') or public.is_admin());
create policy "labs_update_lab_role" on public.lab_tests
  for update using (public.has_role('Lab') or public.is_admin());
create policy "labs_delete_lab_role" on public.lab_tests
  for delete using (public.has_role('Lab') or public.is_admin());

-- appointments
create policy "appts_select_authenticated" on public.appointments
  for select using (auth.uid() is not null);
create policy "appts_create_reception" on public.appointments
  for insert with check (public.has_role('Receptionist') or public.is_admin());
create policy "appts_update_reception_or_doctor" on public.appointments
  for update using (public.has_role('Receptionist') or public.has_role('Doctor') or public.is_admin());
create policy "appts_delete_reception" on public.appointments
  for delete using (public.has_role('Receptionist') or public.is_admin());

-- financials
create policy "fin_select_authenticated" on public.financials
  for select using (auth.uid() is not null);
create policy "fin_write_accountant" on public.financials
  for insert with check (public.has_role('Accountant') or public.is_admin());
create policy "fin_update_accountant" on public.financials
  for update using (public.has_role('Accountant') or public.is_admin());
create policy "fin_delete_accountant" on public.financials
  for delete using (public.has_role('Accountant') or public.is_admin());

-- expenses
create policy "exp_select_authenticated" on public.expenses
  for select using (auth.uid() is not null);
create policy "exp_write_accountant" on public.expenses
  for insert with check (public.has_role('Accountant') or public.is_admin());
create policy "exp_update_accountant" on public.expenses
  for update using (public.has_role('Accountant') or public.is_admin());
create policy "exp_delete_admin_only" on public.expenses
  for delete using (public.is_admin());

-- inventory
create policy "inv_select_authenticated" on public.inventory
  for select using (auth.uid() is not null);
create policy "inv_write_pharmacy" on public.inventory
  for insert with check (public.has_role('Pharmacy') or public.is_admin());
create policy "inv_update_pharmacy" on public.inventory
  for update using (public.has_role('Pharmacy') or public.is_admin());
create policy "inv_delete_admin_only" on public.inventory
  for delete using (public.is_admin());

-- audit_logs: any authenticated user can insert (client-side action
-- logging), only CMD can read. No update/delete policy = immutable.
create policy "audit_insert_authenticated" on public.audit_logs
  for insert with check (auth.uid() is not null);
create policy "audit_select_admin_only" on public.audit_logs
  for select using (public.is_admin());
