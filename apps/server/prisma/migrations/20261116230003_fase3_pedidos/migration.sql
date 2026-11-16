-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sku" TEXT,
    "priceCents" INTEGER,
    "sizes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizeSurchargeCents" JSONB,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "customizable" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "ncm" TEXT,
    "cfop" TEXT,
    "origin" INTEGER DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personType" "PersonType" NOT NULL DEFAULT 'PF',
    "document" TEXT,
    "stateRegistration" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "cityCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT,
    "conversationId" TEXT,
    "connectionId" TEXT,
    "createdById" TEXT,
    "customerData" JSONB,
    "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'PICKUP',
    "desiredDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER,
    "customization" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_document_key" ON "Customer"("document");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_token_key" ON "Order"("token");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_conversationId_idx" ON "Order"("conversationId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
