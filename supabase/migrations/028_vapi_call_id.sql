-- Migration 028: Fix Vapi call logging — add vapi_call_id.
--
-- Diagnosis (Session 12 follow-up):
--   * `calls.id` is `uuid PRIMARY KEY DEFAULT gen_random_uuid()` (migration 001).
--   * Both `/api/webhooks/vapi` and `/api/vapi/functions` (log_outcome)
--     were writing Vapi's `call_xxx` string identifier into that UUID
--     column. Postgres rejects the cast, so every upsert/update failed
--     silently and nothing was persisted. That's why "Vapi is not
--     sending call data back to the portal" — Vapi was, the receiver
--     dropped it.
--   * Other call columns already exist from earlier migrations:
--       ended_reason, summary, caller_name      → migration 003
--       transfer_to, transfer_success            → migration 023
--     So this migration only needs to add the missing external-ID column.
--
-- After this migration, both routes upsert keyed on vapi_call_id so:
--   * log_outcome (mid-call function call from Vapi) and the
--     end-of-call-report webhook can land in any order and merge.
--   * Existing rows (id-only) stay untouched. Postgres treats multiple
--     NULL vapi_call_id values as distinct under a UNIQUE constraint,
--     so the unique index doesn't conflict with legacy data.

alter table calls
  add column if not exists vapi_call_id text;

create unique index if not exists calls_vapi_call_id_unique
  on calls(vapi_call_id)
  where vapi_call_id is not null;

create index if not exists calls_business_started_at_idx
  on calls(business_id, started_at desc);
