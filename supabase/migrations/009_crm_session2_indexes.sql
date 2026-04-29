-- Migration 009: CRM Session 2 indexes
-- Hot paths: smart-list resolution (call_count / first_seen / last_seen / tags)
-- and pipeline lookups. All idempotent.

CREATE INDEX IF NOT EXISTS contacts_call_count_idx ON contacts(client_id, call_count);
CREATE INDEX IF NOT EXISTS contacts_first_seen_idx ON contacts(client_id, first_seen);
CREATE INDEX IF NOT EXISTS contacts_last_seen_idx ON contacts(client_id, last_seen);
CREATE INDEX IF NOT EXISTS contacts_tags_idx ON contacts USING gin(tags);

CREATE INDEX IF NOT EXISTS contact_pipeline_stage_idx ON contact_pipeline(stage_id, client_id);
CREATE INDEX IF NOT EXISTS contact_pipeline_contact_lookup_idx ON contact_pipeline(contact_id);
