-- Site expenses. Price is whole rupees.
-- Project and Site ids in this app are UUIDs, so the site foreign key is text.
CREATE TABLE IF NOT EXISTS "SiteExpense" (
    "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "itemName"  TEXT         NOT NULL,
    "price"     BIGINT       NOT NULL,
    "remarks"   TEXT,
    "siteId"    TEXT         NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SiteExpense_siteId_idx" ON "SiteExpense"("siteId");
CREATE INDEX IF NOT EXISTS "SiteExpense_createdAt_idx" ON "SiteExpense"("createdAt");

ALTER TABLE "SiteExpense"
    ADD CONSTRAINT "SiteExpense_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
