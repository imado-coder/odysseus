-- Billing: the Subscription row becomes a copy of what Shopify last said.
--
-- Nothing wrote this table before, so both defaults are changed rather than
-- migrated: "trial" and "active" were placeholders from the schema's first
-- draft, and "active" in particular is dangerous now that a row is read to
-- decide whether a shop may use the app — a row created by any code path that
-- forgot to set the status would have granted access for free.
--
-- The vocabulary is Shopify's own, upper case, plus NONE for "Shopify lists no
-- subscription for this shop".

ALTER TABLE "Subscription"
  ALTER COLUMN "plan" SET DEFAULT 'Essentiel',
  ALTER COLUMN "status" SET DEFAULT 'NONE';

-- A test subscription is indistinguishable from a real one everywhere in the
-- API and charges nobody. Stored so the pricing screen can say so out loud.
ALTER TABLE "Subscription"
  ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
