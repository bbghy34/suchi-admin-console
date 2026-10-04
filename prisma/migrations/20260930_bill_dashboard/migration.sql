-- Project payments and BOQ bills. Amounts are whole rupees.
-- Project ids in this app are UUIDs, so the project foreign keys are text.
CREATE TABLE IF NOT EXISTS "ProjectPayment" (
    "id"                  TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "projectId"           TEXT         NOT NULL,
    "billDate"            TIMESTAMP(3) NOT NULL,
    "billNo"              BIGINT       NOT NULL,
    "paymentReceivedDate" TIMESTAMP(3) NOT NULL,
    "treasuryBillDoc"     TEXT         NOT NULL,
    "amountReceived"      BIGINT       NOT NULL,
    "createdBy"           TEXT,
    "updatedBy"           TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectPayment_projectId_idx" ON "ProjectPayment"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectPayment_billDate_idx" ON "ProjectPayment"("billDate");

ALTER TABLE "ProjectPayment"
    ADD CONSTRAINT "ProjectPayment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BoqBill" (
    "id"              TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "projectId"       TEXT         NOT NULL,
    "billDate"        TIMESTAMP(3) NOT NULL,
    "billNo"          BIGINT       NOT NULL,
    "billAmount"      BIGINT       NOT NULL,
    "partyName"       TEXT         NOT NULL,
    "phoneNo"         TEXT         NOT NULL,
    "billPayment"     BIGINT       NOT NULL,
    "billPaymentDate" TIMESTAMP(3) NOT NULL,
    "createdBy"       TEXT,
    "updatedBy"       TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoqBill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BoqBill_projectId_idx" ON "BoqBill"("projectId");
CREATE INDEX IF NOT EXISTS "BoqBill_billDate_idx" ON "BoqBill"("billDate");

ALTER TABLE "BoqBill"
    ADD CONSTRAINT "BoqBill_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
