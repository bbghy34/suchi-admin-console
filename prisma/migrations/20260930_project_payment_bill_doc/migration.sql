-- Storage path for the treasury bill file uploaded with a project payment.
ALTER TABLE "ProjectPayment"
    ADD COLUMN IF NOT EXISTS "treasuryBillPath" TEXT;
