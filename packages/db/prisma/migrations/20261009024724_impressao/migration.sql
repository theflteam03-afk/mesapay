-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- AlterTable
ALTER TABLE "Printer" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "width" INTEGER NOT NULL DEFAULT 48;

-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "reprint" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Printer_restaurantId_idx" ON "Printer"("restaurantId");

-- CreateIndex
CREATE INDEX "PrintJob_restaurantId_status_idx" ON "PrintJob"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "PrintJob_orderId_idx" ON "PrintJob"("orderId");
