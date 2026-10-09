-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "clientRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_clientRef_key" ON "Order"("restaurantId", "clientRef");

-- No máximo UMA comanda aberta (OPEN ou PAYING) por mesa. Duas pessoas a escanear o QR
-- ao mesmo tempo não criam duas comandas: a segunda inserção falha e o código relê a existente.
-- (Índice parcial: o schema.prisma não consegue expressá-lo, por isso é escrito à mão.)
CREATE UNIQUE INDEX "TableSession_one_open_per_table" ON "TableSession"("tableId") WHERE "status" <> 'CLOSED';
