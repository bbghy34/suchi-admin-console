-- Parties linked to BOQ bills. Existing party names become Party rows.
-- Ids stay text UUIDs. GST is text because a GSTIN is alphanumeric.
CREATE TABLE IF NOT EXISTS "Party" (
    "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "name"      TEXT         NOT NULL,
    "phoneNo"   TEXT         NOT NULL,
    "gst"       TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Party_name_idx" ON "Party"("name");

INSERT INTO "Party" ("id", "name", "phoneNo")
SELECT gen_random_uuid()::TEXT, grouped.name, grouped.phone
FROM (
    SELECT "partyName" AS name, "phoneNo" AS phone
    FROM "BoqBill"
    GROUP BY "partyName", "phoneNo"
) grouped
WHERE NOT EXISTS (
    SELECT 1 FROM "Party" existing
    WHERE existing."name" = grouped.name
      AND existing."phoneNo" = grouped.phone
);

ALTER TABLE "BoqBill" ADD COLUMN IF NOT EXISTS "partyId" TEXT;

UPDATE "BoqBill" bill
SET "partyId" = party."id"
FROM "Party" party
WHERE bill."partyId" IS NULL
  AND party."name" = bill."partyName"
  AND party."phoneNo" = bill."phoneNo";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "BoqBill" WHERE "partyId" IS NULL) THEN
        RAISE EXCEPTION 'Could not link every BOQ bill to a party.';
    END IF;
END $$;

ALTER TABLE "BoqBill" ALTER COLUMN "partyId" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BoqBill_partyId_fkey'
    ) THEN
        ALTER TABLE "BoqBill"
            ADD CONSTRAINT "BoqBill_partyId_fkey"
            FOREIGN KEY ("partyId") REFERENCES "Party"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BoqBill_partyId_idx" ON "BoqBill"("partyId");

ALTER TABLE "BoqBill" DROP COLUMN IF EXISTS "partyName";
