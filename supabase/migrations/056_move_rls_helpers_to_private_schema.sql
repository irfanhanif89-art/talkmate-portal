-- Move the 3 SECURITY DEFINER RLS helper functions out of `public` (where
-- PostgREST auto-exposes them at /rest/v1/rpc/<name>) into a `private`
-- schema that PostgREST does not expose.
--
-- Why this is safe:
--   * Postgres tracks RLS-policy -> function dependencies by OID, not by
--     textual name. ALTER FUNCTION ... SET SCHEMA preserves the OID, so
--     all 64 RLS policies on public.* and storage.objects that reference
--     these functions continue to resolve them with zero rewrite needed.
--   * Function GRANTs follow the function across the schema move, so
--     anon/authenticated keep their EXECUTE permission (required during
--     RLS policy evaluation).
--   * The functions are not called via supabase.rpc() anywhere in the
--     talkmate-portal or talkmate-mobile codebases (grep confirmed).
--   * Service-role admin client connections never went through these
--     anyway (admin bypasses RLS).
--
-- What changes after this migration:
--   * /rest/v1/rpc/current_rep_id, /rest/v1/rpc/get_current_client_id,
--     and /rest/v1/rpc/is_super_admin disappear from the public API.
--   * The Supabase security advisor stops flagging them as
--     anon/authenticated SECURITY DEFINER executables.
--   * All RLS policies continue working as before.

CREATE SCHEMA IF NOT EXISTS private;

-- Allow the public-API roles (anon, authenticated) to resolve names
-- inside the private schema. This is required for RLS policy evaluation
-- because policies referencing private.<fn>() still execute under the
-- calling role even though Postgres has already locked the function OID.
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- Move the three helpers. EXECUTE grants and the COMMENT ON FUNCTION
-- strings from migration 054 follow the functions to the new schema.
ALTER FUNCTION public.current_rep_id()        SET SCHEMA private;
ALTER FUNCTION public.get_current_client_id() SET SCHEMA private;
ALTER FUNCTION public.is_super_admin()        SET SCHEMA private;
