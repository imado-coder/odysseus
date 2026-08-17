-- CreateEnum
CREATE TYPE "CarrierProvider" AS ENUM ('YALIDINE', 'ZR_EXPRESS', 'ECOTRACK', 'MAYSTRO', 'NOEST', 'MANUAL');

-- CreateEnum
CREATE TYPE "ShipmentState" AS ENUM ('QUEUED', 'PUSHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "provider" "CarrierProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "autoPush" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT,
    "fromWilaya" TEXT,
    "credentialsRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "codOrderId" TEXT NOT NULL,
    "state" "ShipmentState" NOT NULL DEFAULT 'QUEUED',
    "trackingNumber" TEXT,
    "labelUrl" TEXT,
    "carrierStatus" TEXT,
    "mappedStatus" "CodStatus",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "request" JSONB,
    "response" JSONB,
    "pushedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Carrier_shopId_idx" ON "Carrier"("shopId");
CREATE UNIQUE INDEX "Carrier_shopId_name_key" ON "Carrier"("shopId", "name");

-- At most one default carrier per shop. A partial unique index is the only
-- way to say this in the database; enforcing it in application code means it
-- holds until the first concurrent write.
CREATE UNIQUE INDEX "Carrier_one_default_per_shop" ON "Carrier"("shopId") WHERE "isDefault";

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_codOrderId_key" ON "Shipment"("codOrderId");
CREATE INDEX "Shipment_shopId_state_idx" ON "Shipment"("shopId", "state");
CREATE INDEX "Shipment_carrierId_idx" ON "Shipment"("carrierId");
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- AddForeignKey
ALTER TABLE "Carrier" ADD CONSTRAINT "Carrier_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_codOrderId_fkey" FOREIGN KEY ("codOrderId") REFERENCES "CodOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: rates become per-carrier.
--
-- Additive on purpose. The column is nullable, so every row that exists today
-- keeps working and simply means "the shop's own list" — the price used when
-- no carrier is linked, or when the linked carrier has not priced that wilaya.
ALTER TABLE "ShippingRate" ADD COLUMN "carrierId" TEXT;

ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ShippingRate_carrierId_idx" ON "ShippingRate"("carrierId");

-- The old key was (shopId, wilayaCode) and has to go, but its replacement
-- cannot simply add carrierId: Postgres treats two NULLs as distinct, so a
-- plain unique constraint would allow duplicate rows for the shop's own list —
-- which is the most common case, not an edge one. COALESCE gives NULL a single
-- concrete value to collide on.
DROP INDEX "ShippingRate_shopId_wilayaCode_key";

CREATE UNIQUE INDEX "ShippingRate_shop_carrier_wilaya_key"
    ON "ShippingRate"("shopId", COALESCE("carrierId", ''), "wilayaCode");
