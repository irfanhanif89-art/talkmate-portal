-- ============================================================
-- 038_contractor_agreement_flow.sql
-- Contractor agreement flow for TalkMate Sales HQ.
-- All contractor data is admin-only. RLS is enabled with no
-- public/authenticated policies; access is via service role key
-- in /api/contractors/* and /api/contractor-onboarding/* routes.
-- ============================================================

-- CONTRACTORS
create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  abn text,
  bank_bsb text,
  bank_account_number text,
  status text not null default 'invited',
  -- invited | agreement_sent | signed | active | terminated
  invite_token uuid not null default gen_random_uuid(),
  invite_sent_at timestamptz,
  invite_expires_at timestamptz,
  agreement_signed_at timestamptz,
  agreement_signed_ip text,
  signed_pdf_url text,
  termination_date timestamptz,
  termination_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contractors enable row level security;

-- CONTRACTOR AGREEMENTS
create table if not exists contractor_agreements (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  agreement_version text not null default '2.0',
  script_version text not null,
  script_date date not null,
  generated_at timestamptz not null default now(),
  signed_at timestamptz,
  signed_ip text,
  signed_pdf_url text,
  status text not null default 'pending',
  -- pending | signed | superseded
  created_at timestamptz not null default now()
);

alter table contractor_agreements enable row level security;

-- SALES SCRIPTS
create table if not exists sales_scripts (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  content text not null,
  is_active boolean not null default false,
  activated_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sales_scripts enable row level security;

-- SCRIPT ACKNOWLEDGEMENTS
create table if not exists script_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  script_id uuid not null references sales_scripts(id) on delete cascade,
  script_version text not null,
  acknowledged_at timestamptz not null default now(),
  acknowledged_ip text,
  unique(contractor_id, script_id)
);

alter table script_acknowledgements enable row level security;

-- CONTRACTOR COMMISSIONS
create table if not exists contractor_commissions (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  client_business_id uuid references businesses(id),
  plan_type text not null,
  -- starter | growth | pro
  billing_cycle text not null,
  -- monthly | annual
  sale_amount numeric(10,2) not null,
  commission_amount numeric(10,2) not null,
  status text not null default 'pending',
  -- pending | cleared | clawback | paid
  clawback_period_ends_at timestamptz not null,
  clawback_reason text,
  paid_at timestamptz,
  stripe_payment_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contractor_commissions enable row level security;

-- INDEXES
create index if not exists idx_contractors_email on contractors(email);
create index if not exists idx_contractors_invite_token on contractors(invite_token);
create index if not exists idx_contractors_status on contractors(status);
create index if not exists idx_contractor_agreements_contractor_id on contractor_agreements(contractor_id);
create index if not exists idx_script_acknowledgements_contractor_id on script_acknowledgements(contractor_id);
create index if not exists idx_contractor_commissions_contractor_id on contractor_commissions(contractor_id);
create index if not exists idx_contractor_commissions_status on contractor_commissions(status);
create index if not exists idx_sales_scripts_is_active on sales_scripts(is_active);

-- UPDATED_AT TRIGGERS
-- Reuse the project's existing update_updated_at_column() if present;
-- create it idempotently here so this migration can run standalone.
create or replace function update_updated_at_column()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists contractors_updated_at on contractors;
create trigger contractors_updated_at before update on contractors
  for each row execute function update_updated_at_column();

drop trigger if exists contractor_commissions_updated_at on contractor_commissions;
create trigger contractor_commissions_updated_at before update on contractor_commissions
  for each row execute function update_updated_at_column();

drop trigger if exists sales_scripts_updated_at on sales_scripts;
create trigger sales_scripts_updated_at before update on sales_scripts
  for each row execute function update_updated_at_column();

-- ENFORCE ONE ACTIVE SCRIPT
create or replace function enforce_single_active_script()
returns trigger as $$
begin
  if new.is_active = true then
    update sales_scripts set is_active = false
    where is_active = true and id != new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists single_active_script on sales_scripts;
create trigger single_active_script before update on sales_scripts
  for each row when (new.is_active = true)
  execute function enforce_single_active_script();
