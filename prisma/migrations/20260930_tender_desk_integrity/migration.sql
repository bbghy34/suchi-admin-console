ALTER TABLE "DeskTender" ADD COLUMN "summaryRunId" TEXT, ADD COLUMN "summaryStartedAt" TIMESTAMP(3);
ALTER TABLE "DeskRefundApplication" ADD COLUMN "instrumentsSnapshot" TEXT;
