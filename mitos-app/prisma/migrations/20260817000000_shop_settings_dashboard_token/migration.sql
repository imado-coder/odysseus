-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "dashboardToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_dashboardToken_key" ON "ShopSettings"("dashboardToken");
