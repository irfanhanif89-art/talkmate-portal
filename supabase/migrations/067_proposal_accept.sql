-- Session: automated PDF proposals + acceptance flow
-- Adds the accept token + acceptance tracking columns to proposal_tracking, and
-- extends the leads.status CHECK constraint with 'proposal_accepted'.
-- Apply to preview first, then prod after code is live (gated).

alter table public.proposal_tracking
  add column if not exists accept_token text unique,
  add column if not exists accepted_at timestamptz,
  add column if not exists template_type text,
  add column if not exists selected_plan text;

create index if not exists proposal_tracking_accept_token_idx
  on public.proposal_tracking (accept_token);

-- leads.status is governed by CHECK constraint "leads_status_check".
-- Current allowed values (prod, verified 2026-06-02):
--   new, contacted, demo_booked, demo_done, proposal_sent, won, lost, nurture, bad_lead
-- Recreate it adding 'proposal_accepted' (placed after proposal_sent).
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status = any (array[
    'new'::text,
    'contacted'::text,
    'demo_booked'::text,
    'demo_done'::text,
    'proposal_sent'::text,
    'proposal_accepted'::text,
    'won'::text,
    'lost'::text,
    'nurture'::text,
    'bad_lead'::text
  ]));
