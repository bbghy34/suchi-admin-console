-- Accept / reject for BOQ extra items, with the remarks recorded at decision time.
ALTER TABLE "ExtraItemBOQ" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ExtraItemBOQ" ADD COLUMN IF NOT EXISTS "decisionRemarks" TEXT;

UPDATE "ExtraItemBOQ"
SET "status" = 'ACCEPTED'
WHERE "isApproved" = true AND "status" = 'PENDING';
