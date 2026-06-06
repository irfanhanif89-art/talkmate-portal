-- Session 6A follow-up (audit fix). The live-call indicator subscribes to
-- realtime postgres_changes on active_calls with a `business_id=eq.<id>` filter.
-- Supabase only delivers DELETE events to a FILTERED subscription if the table
-- has REPLICA IDENTITY FULL — otherwise the deleted row carries only its
-- primary key (id), the business_id filter can't match, and the client never
-- receives the DELETE, so the "Live call" pill would not clear when a call
-- ends (until a manual page refresh). The table holds at most one row per
-- business, so FULL replica identity is negligible cost.

ALTER TABLE active_calls REPLICA IDENTITY FULL;
