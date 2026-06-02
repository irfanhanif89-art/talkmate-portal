# Sales Resources — Design Spec

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)
**Author:** Claude Code session with Irfan

## Problem

Admins want to give sales reps reference documents they can read in
their portal — e.g. a one-pager Jade or Navia can pull up on a call. Files may
be **PDF or HTML** (Jade's first resource is an HTML file). The only thing
that looks adjacent today is the admin **Sales Scripts** page, but that is a
*compliance* tool: each version is plain text that contractors must
*acknowledge* when they sign their agreement, and activating a version forces
every rep to re-acknowledge. It was never built to hold reference files, and
overloading it with PDFs would muddy its legal-acknowledgement purpose.

## Goal

A separate, lightweight **Sales Resources** library:

- Admin uploads a resource file — **PDF or HTML** (title + optional description).
- By default every active rep sees it in a new **Resources** tab.
- Admin can optionally **restrict** a resource to specific reps (e.g. Jade only).
- Reps open the file via an auth-checked view route (never a public link).
- Admin can **archive** a resource; archived resources disappear from rep view.

Jade is the first user (an HTML file); nothing in the design is rep-specific.

## Non-goals (YAGNI for v1)

- No acknowledgement / version-control (that is what Sales Scripts already does).
- No categories / folders.
- PDF and HTML only — no other file types, no link/video resources.
- No edit-in-place of an uploaded file (re-upload as a new resource instead).
- No changes to Sales Scripts or any existing table.

## Approved decisions

- **Access model:** shared by default, optionally restricted to specific reps.
- **File type:** PDF or HTML (≤ 20 MB). PDF uses the existing contract-upload
  validation; HTML is the new case (see Security below).
- **Archive behaviour:** archived resources vanish from the rep's list *and*
  from the admin list (soft archive via `is_active = false`; the row and file
  are retained in the DB as a safety net, with no un-archive UI in v1 —
  re-upload to restore). Effectively a recoverable delete.

## Architecture

Reuses the existing "My Contract" PDF pipeline almost line-for-line:
admin uploads → Supabase Storage (private bucket) → DB row → rep reads via a
1-hour signed URL generated server-side. Auth via the existing `requireAdmin`
and `requireSalesRep` helpers. All Storage access goes through
`createAdminClient()` (service role), so the API query is the real access-control
boundary; bucket RLS is belt-and-braces.

### 1. Database — migration `068_sales_resources.sql`

```sql
CREATE TABLE IF NOT EXISTS sales_resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  file_path   TEXT NOT NULL,           -- object path in the sales-resources bucket
  file_name   TEXT NOT NULL,           -- original filename for display/download
  file_size   BIGINT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,   -- false = archived (hidden from reps)
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_resource_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES sales_resources(id) ON DELETE CASCADE,
  rep_id      UUID NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resource_id, rep_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_resource_assignments_resource
  ON sales_resource_assignments(resource_id);
CREATE INDEX IF NOT EXISTS idx_sales_resource_assignments_rep
  ON sales_resource_assignments(rep_id);
```

**Visibility rule (the whole "shared + optional targeting" model):**

- A resource with **zero** rows in `sales_resource_assignments` → visible to
  **all active reps** (shared).
- A resource with **≥ 1** assignment row → visible **only** to those reps.

So "Navia only" = one assignment row for Navia. "Everyone" = no rows.

### 2. Storage — bucket `sales-resources`

New private bucket, provisioned in the same migration, mirroring `rep-contracts`:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('sales-resources', 'sales-resources', false)
ON CONFLICT (id) DO NOTHING;

-- admin (service-role) full access; reads always go through signed URLs.
DROP POLICY IF EXISTS "sales_resources_admin_all" ON storage.objects;
CREATE POLICY "sales_resources_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'sales-resources' AND is_super_admin())
  WITH CHECK (bucket_id = 'sales-resources' AND is_super_admin());
```

Object path: `{resource_id}/{timestamp}_{cleaned_filename}.{ext}` — the real
extension (`.pdf` or `.html`) is preserved, NOT forced to `.pdf` like the
contract route. The upload call passes the file's actual MIME type
(`contentType: file.type`) so the signed URL serves PDFs as PDFs and HTML as
`text/html` (which the browser then renders).

### 3. Admin side

**Page:** `/admin/sales-resources` (server component fetches list → client view),
plus a nav entry in the admin sidebar next to Sales Scripts / Sales Team.

**List columns:** Title · Visibility (`All reps` or `N rep(s)`) · File · Uploaded · Actions.
Actions: **Open** (signed URL), **Manage access**, **Archive**.

**Upload modal:** title (required), description (optional), file picker
(`accept=".pdf,.html"`; client checks type is `application/pdf` or `text/html`
+ ≤ 20 MB), and an optional **"Restrict to specific reps"** multi-select
populated from active `sales_reps`. Empty = all reps.

**Manage-access modal:** same multi-select, edits `sales_resource_assignments`
for an existing resource.

**APIs (all `requireAdmin`):**

- `GET  /api/admin/sales-resources` — list active resources with assignment counts.
- `POST /api/admin/sales-resources` — multipart: validate type is PDF or HTML
  and size ≤ 20 MB, upload to bucket with the real content-type, insert
  `sales_resources` row, insert any assignment rows. On insert failure, clean
  up the orphaned storage object (mirrors contract route).
- `PATCH /api/admin/sales-resources/[id]` — update title/description, replace
  assignment set, and/or set `is_active` (archive). JSON body.
- `GET  /api/admin/sales-resources/[id]/view` — admin preview; streams the file
  through our origin with the correct Content-Type (+ CSP sandbox for HTML).

### 4. Rep side

**Page:** `/sales/resources` (server component), plus a **Resources** entry in
`src/components/sales/sales-nav.tsx` next to Training.

The server component selects resources where `is_active = true` AND
(the resource has no assignment rows OR an assignment row exists for this rep).
Renders a simple list of cards: title, description, an **Open** button.

**API (`requireSalesRep`):** `GET /api/sales/resources/[id]/view`
— re-checks the rep is allowed to see that resource (active + shared-or-assigned),
then streams the file through our origin with the correct `Content-Type`
(+ CSP sandbox for HTML — see Security). Archived/unassigned/unknown ids
return 404. The Open button opens this route in a **new tab**
(`rel="noopener noreferrer"`); no client-side fetch needed.

## Components / files (new)

| File | Purpose |
|------|---------|
| `supabase/migrations/068_sales_resources.sql` | Tables, indexes, bucket, policy |
| `src/app/(portal)/admin/sales-resources/page.tsx` | Admin page (server) |
| `src/app/(portal)/admin/sales-resources/resources-view.tsx` | Admin client UI (list + modals) |
| `src/app/api/admin/sales-resources/route.ts` | GET list, POST upload |
| `src/app/api/admin/sales-resources/[id]/route.ts` | PATCH update/archive/assignments |
| `src/app/api/admin/sales-resources/[id]/view/route.ts` | Admin preview (streams file) |
| `src/app/sales/resources/page.tsx` | Rep page (server, lists visible resources) |
| `src/app/sales/resources/resources-list.tsx` | Rep client list + Open buttons |
| `src/app/api/sales/resources/[id]/view/route.ts` | Rep view route (visibility-checked, streams) |
| `src/lib/sales-resources.ts` | Shared streaming helper (Content-Type + CSP sandbox) |
| `src/components/sales/sales-nav.tsx` | + Resources nav link (edit) |
| admin nav component | + Sales Resources link (edit) |

## Security — uploading & serving HTML

> **Implementation note (discovered during QA):** Supabase Storage deliberately
> serves user-uploaded HTML as `Content-Type: text/plain` with `nosniff`, so a
> signed URL shows the *raw source*, not a rendered page. We therefore do NOT
> redirect to a Supabase signed URL. Instead each resource is streamed back
> through our own route (`/api/.../[id]/view`), which sets the correct
> `Content-Type` so HTML renders — made safe by a CSP sandbox (below).

Allowing HTML upload is intentionally narrow and safe:

- **Opaque-origin sandbox.** The HTML response carries
  `Content-Security-Policy: sandbox` (no `allow-scripts`, no
  `allow-same-origin`). The browser renders markup + CSS but runs the document
  in a unique opaque origin: scripts don't execute, forms/popups are blocked,
  and it has no access to the portal's cookies, session, or `localStorage`. So
  even malicious uploaded HTML cannot hijack a rep's account, even though it is
  served from our own domain. (Verified in QA: response headers were
  `content-type: text/html`, `content-security-policy: sandbox`,
  `x-content-type-options: nosniff`.)
- **Trusted uploader.** Only authenticated admins (`requireAdmin`) can upload.
  Reps can never upload, so this is not a user-content XSS surface.
- **No inline embedding.** We do NOT render resources inside an `<iframe>` on a
  portal page, and we do NOT `dangerouslySetInnerHTML` their contents anywhere.
  The view route is opened in a new tab (`rel="noopener noreferrer"`). Hard rule.
- **Type allow-list.** Server rejects anything whose MIME type is not exactly
  `application/pdf` or `text/html`, before the file reaches storage (and a DB
  CHECK constraint enforces the same two values).
- **No sanitisation of the HTML body.** Because the content is admin-authored
  and sandbox-isolated, we serve it verbatim (sanitising would strip the styling
  that is the whole point of an HTML resource). The safety comes from the CSP
  sandbox, not from scrubbing the markup. PDFs are served inline without the
  sandbox header so the browser's PDF viewer works.

## Error handling

- Upload: reject anything that is not `application/pdf` or `text/html`, or
  > 20 MB, with a 400 before touching storage.
- Orphan cleanup: if the DB insert fails after a successful upload, remove the
  uploaded object (mirrors contract route).
- Rep `view` route: 404 if the resource is missing, archived, or not visible
  to the requesting rep — never stream an unauthorised resource.
- Storage download failure → 404 with the underlying message.

## Testing (per the global build pipeline)

- **Build:** `npm run build` + `npx tsc --noEmit` clean.
- **Validator:** no hardcoded data; correct column names; visibility logic
  enforced in the API query, not just the UI.
- **QA (Playwright, localhost:3000):**
  - Admin uploads an **HTML** file restricted to Jade → appears for Jade, NOT
    for another rep; Jade clicks Open → the HTML renders in a new tab from the
    storage domain.
  - Admin uploads a PDF with no restriction → appears for all test reps; Open
    loads the PDF via signed URL.
  - Admin archives a resource → disappears from the rep list.
  - Reject a non-PDF/non-HTML type and an oversized file with a clear error.
  - 375 px mobile viewport on both new pages.
- **Reviewer:** confirm no impact on Sales Scripts, contracts, or Storage
  buckets already in use; GREEN/YELLOW/RED.

## Rollout

Branch `feature/sales-resources` off `dev`. Ship through the standard pipeline:
build → validate → QA → review → report to Irfan. Migration `068` runs on
preview first, then prod on the `dev → main` promotion. No env vars required.
