-- CreateTable: ExtraItemBOQ
-- Stores extra (variation) items linked to BOQ line items (BOQItems)
CREATE TABLE IF NOT EXISTS "ExtraItemBOQ" (
    "id"           TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "boqItemId"    TEXT,
    "itemName"     TEXT,
    "itemQuantity" TEXT,
    "isApproved"   BOOLEAN     NOT NULL DEFAULT false,
    "approvedBy"   TEXT,
    "requestedBy"  TEXT,
    "remarks"      TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"    TEXT,
    "updatedBy"    TEXT,
    "isActive"     BOOLEAN     NOT NULL DEFAULT true,

    CONSTRAINT "ExtraItemBOQ_pkey" PRIMARY KEY ("id")
);

-- Index on boqItemId for fast lookups by parent BOQ item
CREATE INDEX IF NOT EXISTS "ExtraItemBOQ_boqItemId_idx" ON "ExtraItemBOQ"("boqItemId");

-- AddForeignKey
ALTER TABLE "ExtraItemBOQ"
    ADD CONSTRAINT "ExtraItemBOQ_boqItemId_fkey"
    FOREIGN KEY ("boqItemId") REFERENCES "BOQItems"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;