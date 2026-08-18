-- GDPR: the two rows the mandatory webhooks need.
--
-- Additive only. Nothing existing changes shape, so this is safe to apply
-- while the current functions are deployed.

-- A redacted lead keeps its money and loses its person. Without this column
-- the call list cannot tell a redacted customer from a broken record.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "redactedAt" TIMESTAMP(3);

-- Shopify delivers `customers/data_request` and expects the app to hand the
-- data to the merchant. Only the request is stored; the export is assembled
-- on demand, so the shopper's details are never copied into a second table.
CREATE TABLE IF NOT EXISTS "DataRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyRequestId" TEXT,
    "customerId" TEXT,
    "customerPhone" TEXT,
    "orderIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- Shopify retries a webhook it believes failed. The unique id makes the
-- second delivery an update rather than a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS "DataRequest_shopifyRequestId_key"
    ON "DataRequest"("shopifyRequestId");

CREATE INDEX IF NOT EXISTS "DataRequest_shopId_createdAt_idx"
    ON "DataRequest"("shopId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "DataRequest"
    ADD CONSTRAINT "DataRequest_shopId_fkey" FOREIGN KEY ("shopId")
    REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
