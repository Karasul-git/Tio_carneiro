-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderFor" TIMESTAMP(3),
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "unhappy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "lastReminderAt" TIMESTAMP(3);
