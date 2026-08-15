-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('HOME', 'DESK');

-- CreateEnum
CREATE TYPE "CodStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'NO_ANSWER');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "planName" TEXT,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "autoCreateOrder" BOOLEAN NOT NULL DEFAULT true,
    "orderTag" TEXT NOT NULL DEFAULT 'MITOS-COD',
    "defaultHomeRate" INTEGER NOT NULL DEFAULT 600,
    "defaultDeskRate" INTEGER NOT NULL DEFAULT 350,
    "freeShippingAbove" INTEGER,
    "notifyEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "wilayaCode" TEXT NOT NULL,
    "homeRate" INTEGER NOT NULL,
    "deskRate" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "label" TEXT,
    "badge" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "wilayaCode" TEXT NOT NULL,
    "wilayaName" TEXT NOT NULL,
    "commune" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "delivery" "DeliveryMethod" NOT NULL,
    "note" TEXT,
    "items" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "shipping" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "source" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodOrder" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "shopifyName" TEXT,
    "createFailed" BOOLEAN NOT NULL DEFAULT false,
    "createError" TEXT,
    "status" "CodStatus" NOT NULL DEFAULT 'PENDING',
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "chargeId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "status" TEXT NOT NULL DEFAULT 'active',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wilaya" (
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,

    CONSTRAINT "Wilaya_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Commune" (
    "id" SERIAL NOT NULL,
    "wilayaCode" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,

    CONSTRAINT "Commune_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE INDEX "Shop_domain_idx" ON "Shop"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");

-- CreateIndex
CREATE INDEX "ShippingRate_shopId_idx" ON "ShippingRate"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_shopId_wilayaCode_key" ON "ShippingRate"("shopId", "wilayaCode");

-- CreateIndex
CREATE INDEX "Offer_shopId_productId_idx" ON "Offer"("shopId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_shopId_productId_quantity_key" ON "Offer"("shopId", "productId", "quantity");

-- CreateIndex
CREATE INDEX "Lead_shopId_createdAt_idx" ON "Lead"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_shopId_phone_idx" ON "Lead"("shopId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_shopId_idempotencyKey_key" ON "Lead"("shopId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CodOrder_leadId_key" ON "CodOrder"("leadId");

-- CreateIndex
CREATE INDEX "CodOrder_shopId_status_idx" ON "CodOrder"("shopId", "status");

-- CreateIndex
CREATE INDEX "CodOrder_shopId_createdAt_idx" ON "CodOrder"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "CodOrder_shopifyOrderId_idx" ON "CodOrder"("shopifyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopId_key" ON "Subscription"("shopId");

-- CreateIndex
CREATE INDEX "Commune_wilayaCode_idx" ON "Commune"("wilayaCode");

-- AddForeignKey
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodOrder" ADD CONSTRAINT "CodOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodOrder" ADD CONSTRAINT "CodOrder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commune" ADD CONSTRAINT "Commune_wilayaCode_fkey" FOREIGN KEY ("wilayaCode") REFERENCES "Wilaya"("code") ON DELETE CASCADE ON UPDATE CASCADE;
