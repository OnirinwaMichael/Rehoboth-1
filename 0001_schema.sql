-- Rehoboth Clinic HMS — Supabase schema
-- Mirrors the Firestore collections 1:1 so app logic maps cleanly.

create extension if not exists "pgcrypto";

-- ============================================================
-- users: mirrors auth.users, adds role/status. Row is created
-- by a trigger on auth.users insert (see 0002_auth_trigger.sql)
-- ============================================================
create type user_role as enum ('CMD', 'Doctor', 'Nurse', 'Lab', 'Accountant', 'Receptionist', 'Pharmacy');
create type user_status as enum ('active', 'inactive');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role user_role not null,
  name text not null,
  status user_status not null default 'active',
  photo_url text,
  phone text,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- patients
-- ============================================================
create type patient_category as enum ('single card', 'family card', 'antenatal', 'children''s card');
create type gender_type as enum ('male', 'female');

create table public.patients (
  card_id text primary key,
  name text not null,
  gender gender_type not null,
  dob date not null,
  state_of_origin text,
  age int,
  occupation text,
  address text,
  phone text,
  next_of_kin text,
  relationship text,
  nok_address text,
  nok_phone text,
  category patient_category not null,
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete cascade,
  timestamp timestamptz not null default now(),
  diagnosis text,
  lab_results text,
  structured_lab_note text,
  prescription text,
  prescription_note text,
  billing_amount numeric(12,2) default 0,
  payment_status text check (payment_status in ('pending','paid')),
  staff_id uuid references public.users(id)
);

-- ============================================================
-- medical_records
-- ============================================================
create table public.medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete cascade,
  staff_id uuid not null references public.users(id),
  vitals jsonb,
  diagnosis text,
  prescriptions text[],
  recommended_tests text[],
  admission_recommended boolean default false,
  c_section_recommended boolean default false,
  payment_fee numeric(12,2),
  payment_status text check (payment_status in ('pending','paid')),
  dispensed boolean default false,
  dispensed_at timestamptz,
  dispensed_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- lab_tests
-- ============================================================
create table public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete cascade,
  record_id uuid references public.medical_records(id),
  test_type text not null,
  price numeric(12,2),
  result text,
  structured_results jsonb,
  payment_status text not null check (payment_status in ('pending','paid')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- appointments
-- ============================================================
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete cascade,
  patient_name text not null,
  doctor_id uuid references public.users(id),
  doctor_name text,
  date date not null,
  time time not null,
  reason text,
  status text not null check (status in ('scheduled','completed','cancelled','rescheduled')) default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- financials
-- ============================================================
create table public.financials (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(card_id) on delete cascade,
  total_amount numeric(12,2) not null,
  paid_amount numeric(12,2) not null default 0,
  pending_amount numeric(12,2) not null default 0,
  payment_status text check (payment_status in ('fully paid','partially paid')),
  payment_method text check (payment_method in ('cash','bank transfer')),
  reconciled boolean default false,
  reconciled_at timestamptz,
  reconciled_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- expenses
-- ============================================================
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12,2) not null,
  category text not null check (category in ('salaries','utilities','supplies','maintenance','others')),
  staff_id uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- inventory
-- ============================================================
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12,2) not null,
  stock int not null default 0,
  category text,
  last_updated timestamptz not null default now()
);

-- ============================================================
-- audit_logs — now covers reads as well as writes (fixes gap
-- flagged in review: only writes were logged in Firestore version)
-- ============================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.users(id),
  action text not null,
  details text,
  resource_type text,
  resource_id text,
  timestamp timestamptz not null default now()
);

create index idx_audit_logs_timestamp on public.audit_logs(timestamp desc);
create index idx_medical_records_patient on public.medical_records(patient_id);
create index idx_lab_tests_patient on public.lab_tests(patient_id);
create index idx_visits_patient on public.visits(patient_id);
create index idx_financials_patient on public.financials(patient_id);
