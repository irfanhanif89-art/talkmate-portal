-- Migration 071: Industry Intelligence Packs (Session 3A)
-- Numbered 071+ to avoid a collision with the unmerged feature/social-dm-nurture
-- branch, which already uses 069/070. Renumber at merge time if Social DM lands first.
--
-- IMPORTANT: businesses.industry ALREADY EXISTS with its own CHECK
--   (restaurants/towing/real_estate/trades/healthcare/ndis/retail/professional_services/other)
--   and live data ('trades','towing'). We do NOT touch that column or its constraint.
--   The pack vertical (granular: towing/plumbing/electrical/cleaning/hvac) is stored in a
--   NEW column `industry_pack_applied`. The apply route maps onto the existing industry/
--   trade_type ONLY when they are currently null (never clobbers an admin selection).

BEGIN;

CREATE TABLE IF NOT EXISTS industry_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry text NOT NULL,
  category text NOT NULL CHECK (category IN ('faq','service','hours','pricing','team','custom')),
  question text NOT NULL,
  answer text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent seed target (072b-equivalent uses ON CONFLICT on this).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_industry_packs_industry_question
  ON industry_packs(industry, category, question);

CREATE INDEX IF NOT EXISTS idx_industry_packs_industry
  ON industry_packs(industry, category, sort_order);

-- Read-only reference data: readable by any authenticated user; writes via service role only.
ALTER TABLE industry_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS industry_packs_read ON industry_packs;
CREATE POLICY industry_packs_read ON industry_packs
  FOR SELECT TO authenticated USING (true);

-- New, dedicated column for "which pack was applied" (does NOT collide with businesses.industry).
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS industry_pack_applied text
    CHECK (industry_pack_applied IS NULL
           OR industry_pack_applied IN ('towing','plumbing','electrical','cleaning','hvac'));

COMMIT;
