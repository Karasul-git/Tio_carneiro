-- CreateEnum
CREATE TYPE "BotState" AS ENUM ('NONE', 'MENU', 'COLLECTING', 'FAQ', 'HANDOFF', 'HUMAN');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "botMessagesInSession" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "botState" "BotState" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "handoffAt" TIMESTAMP(3),
ADD COLUMN     "handoffReason" TEXT,
ADD COLUMN     "intent" TEXT,
ADD COLUMN     "sessionStartedAt" TIMESTAMP(3),
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "triage" JSONB;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "WhatsAppConnection" ADD COLUMN     "botEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "variants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);
