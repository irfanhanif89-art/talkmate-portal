-- Session 3 — White label foundation, partner tier fields, ABN, cancellation flow.
-- Idempotent. Safe to re-run.

----------------------------------------------------------------------
-- 1. white_label_configs — one row per partner business (or seeded
--    standalone for demos like Proxima where the partner_id is null).
----------------------------------------------------------------------

create table if not exists white_label_configs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references businesses(id) on delete cascade,
  brand_name text not null,
  brand_logo_url text,
  primary_color text default '#E8622A',
  secondary_color text default '#061322',
  accent_color text default '#1565C0',
  custom_domain text,
  portal_subdomain text unique,
  support_email text,
  support_phone text,
  hide_talkmate_branding boolean default false,
  is_active boolean default false,
  created_at timestamptz default now()
);

alter table white_label_configs enable row level security;

drop policy if exists "partner can manage own config" on white_label_configs;
create policy "partner can manage own config" on white_label_configs
  for all using (partner_id = get_current_client_id());

-- The /wl-preview/[subdomain] page reads anonymously by subdomain — service
-- role bypasses RLS, but we also allow anon SELECT on rows where
-- is_active = true so the preview can render without an admin client.
drop policy if exists "anon read active configs" on white_label_configs;
create policy "anon read active configs" on white_label_configs
  for select to anon using (is_active = true);

-- Helpful indexes for the lookup paths the app uses.
create index if not exists idx_wl_configs_partner_id on white_label_configs(partner_id);
create index if not exists idx_wl_configs_subdomain on white_label_configs(portal_subdomain) where portal_subdomain is not null;

----------------------------------------------------------------------
-- 2. Partner tier + referral fields on businesses.
----------------------------------------------------------------------

alter table businesses add column if not exists is_partner boolean default false;
alter table businesses add column if not exists partner_tier text
  check (partner_tier in ('starter', 'silver', 'gold'));
alter table businesses add column if not exists partner_commission_rate numeric(4,2) default 15.00;
alter table businesses add column if not exists referred_by uuid references businesses(id);

create index if not exists idx_businesses_referred_by on businesses(referred_by) where referred_by is not null;
create index if not exists idx_businesses_is_partner on businesses(is_partner) where is_partner = true;

----------------------------------------------------------------------
-- 3. ABN.
----------------------------------------------------------------------

alter table businesses add column if not exists abn text;
alter table businesses add column if not exists abn_verified boolean default false;

----------------------------------------------------------------------
-- 4. Subscription cancellation flow (Session 3 brief Part 2).
----------------------------------------------------------------------

alter table subscriptions add column if not exists cancel_at_period_end boolean default false;
alter table subscriptions add column if not exists cancellation_reason text;
alter table subscriptions add column if not exists cancellation_requested_at timestamptz;

----------------------------------------------------------------------
-- 5. Seed Proxima Agent demo white-label config.
--    partner_id is null — this is a demo-only row for /wl-preview/proxima.
--    The on conflict skips re-insert if the migration is re-run.
----------------------------------------------------------------------

insert into white_label_configs (
  brand_name, primary_color, secondary_color, accent_color,
  portal_subdomain, support_email, hide_talkmate_branding, is_active
)
values (
  'Proxima Agent', '#1B4FBB', '#0A1E38', '#E8622A',
  'proxima', 'support@proxima.com.au', false, true
)
on conflict (portal_subdomain) do nothing;
