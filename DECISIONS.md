# TalkMate — Architecture Decisions

Every entry here explains WHY a decision was made, not just what was decided.
Understanding the why prevents the decision from being accidentally reversed.
Read this before proposing any architectural change to an existing system.

---

## Database Schema

### `contact_calls` join table (not `calls.contact_id`)
**Decision:** Contact-to-call relationships are stored in a separate `contact_calls`
join table. The `calls` table does not have a `contact_id` column.
**Why:** A single call can involve multiple contacts (e.g., a dispatcher and a driver).
A direct `contact_id` on `calls` only supports one-to-one. The join table allows
many-to-many and is easier to query without joins blowing up.
**Implication:** Never write to `calls.contact_id`. It does not exist. Always use `contact_calls`.

### `businesses.owner_user_id` (not `owner_id`)
**Decision:** The foreign key to the Supabase Auth user is named `owner_user_id`.
**Why:** `owner_id` is ambiguous — it could mean anything. `owner_user_id` is explicit
about what it references (the auth `users` table). The longer name was chosen
deliberately during schema design to prevent confusion.
**Implication:** Any query filtering by the owner must use `.eq('owner_user_id', userId)`.

### `vapi_call_id` as TEXT (not UUID)
**Decision:** Vapi call identifiers are stored in TEXT columns, never UUID columns.
**Why:** Vapi generates its own ID format (`call_01abc...`) which is not a valid UUID.
Attempting to store these in a UUID column causes either a cast error or silent data loss.
**Implication:** Any column storing an external system's ID (Vapi, Stripe, Twilio) must be TEXT.

### `account_status` as a checked string (not boolean `is_active`)
**Decision:** Business account state is stored as `account_status` with string values:
`pending`, `active`, `suspended`, `cancelled`, `expired`.
**Why:** A boolean `is_active` only supports two states. TalkMate needs to distinguish
between a cancelled account (owner chose to leave), an expired account (payment lapsed),
and a suspended account (admin action). These require different handling.
**Implication:** Every businesses query must filter `NOT IN ('cancelled', 'expired')`.
Never filter by a boolean `is_active` — that column does not exist.

### Migrations applied preview-first, never prod-only
**Decision:** Every database migration is applied to the preview Supabase project
(`rgifivtzmjvanzqwgadq`) first and verified before touching production (`mdsfdaefsxwrakgkyflr`).
**Why:** Supabase migrations cannot be rolled back cleanly once applied. A bad migration
on production with live client data (GM Towing, Spectrum Towing) causes real data loss.
The preview project is a safe rehearsal environment.
**Implication:** Never apply a migration directly to production. Always preview first.
Always wait for Irfan's approval before production apply.

### `notifications_config.live_transfer_number` as canonical transfer number
**Decision:** The number to transfer live calls to is stored in `notifications_config.live_transfer_number`,
not hardcoded in Vapi agent config or anywhere else.
**Why:** Business owners need to be able to change their transfer number without a
code deploy or Vapi agent update. Storing it in the DB lets the portal UI expose
a settings field that updates it instantly.
**Implication:** Any code that needs the transfer number must read it from `notifications_config`.
Never hardcode a phone number.

---

## Architecture

### Make.com for automations (not in-app code)
**Decision:** Cross-system automations (e.g., Stripe event → Supabase record update,
call completed → CRM update) run in Make.com, not as Next.js API routes.
**Why:** Make.com provides visual debugging, retry logic, error notifications, and
scenario history without writing infrastructure code. For a two-client SaaS,
the cost of Make.com is far lower than the engineering cost of building reliable
async job infrastructure.
**Implication:** Do not replace a Make.com scenario with an API route unless the
scenario has grown too complex or there is a specific performance reason. Get Irfan's
sign-off before moving any automation in-house.

### Supabase service role client only in API routes
**Decision:** The Supabase admin client (initialized with `SUPABASE_SERVICE_ROLE_KEY`)
is only instantiated in server-side API routes, never in React server components,
client components, or utility files that might be imported on the client.
**Why:** The service role key bypasses RLS. If it reaches the browser, any user can
make unrestricted DB queries. Next.js server components can be mistakenly bundled
client-side, so the safest policy is API routes only.
**Implication:** If a server component needs admin-level data access, move that logic
to an API route and call it from the component. Never import the admin client
directly in a component file.

### Vapi agent config synced via Sync Agent button (not real-time)
**Decision:** Changes to the Vapi agent's knowledge base, system prompt, or tools
are applied by the user clicking a "Sync Agent" button in the portal, not automatically
on every DB save.
**Why:** Real-time sync creates race conditions when multiple settings are changed
quickly. The sync operation calls Vapi's API and can take 2-3 seconds — doing it
on every field save would make the UI feel broken.
**Implication:** Every portal page where data feeds the Vapi agent must have a
Sync Agent button visible to the user (both client and admin views). This is non-negotiable.

### Auth table is `users` (not `profiles`)
**Decision:** The Supabase Auth user table is referenced as `users` in RLS policies
and joins, not `profiles`.
**Why:** TalkMate does not use a separate `profiles` table. The auth.users table
is the single source of user identity. A `profiles` table was considered in early
design but rejected to keep the schema simpler.
**Implication:** Any RLS policy or query that needs the current user ID uses
`auth.uid()` and joins against `users`, not `profiles`.

---

## Tooling

### `claude-sonnet-4-6` and `grok-3` as the canonical model identifiers
**Decision:** AI model calls in TalkMate code always use these exact strings:
- Anthropic: `claude-sonnet-4-6`
- xAI: `grok-3`
**Why:** Anthropic and xAI deprecate older model identifiers without always giving
a clean migration path. Using the specific current-generation string prevents
silent failures when an alias stops working.
**Implication:** Any code that calls an AI API must use these strings. The `SCORING_PROVIDER`
env var controls which provider is used, but the model string is always the current one.

### Single canonical working directory
**Decision:** The talkmate-portal repo lives at exactly one path:
`C:\Users\info\.claude\WEBSITE BUILD\talkmate-portal`
**Why:** Earlier in TalkMate's development, copies of files existed in multiple locations
causing confusion about which was the source of truth. All work now happens in the
single repo directory. No copies, no local mirrors.
**Implication:** Claude Code must always confirm it is in this directory before any
file operation. Never create files outside this directory without explicit instruction.
