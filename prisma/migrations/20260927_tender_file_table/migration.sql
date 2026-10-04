-- Each manually uploaded tender file is its own row.
-- Project.tenderId stays the tender reference. This table is the only file store.
CREATE TABLE IF NOT EXISTS "TenderFile" (
    "id"          TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "projectId"   TEXT         NOT NULL,
    "tenderId"    TEXT         NOT NULL,
    "kind"        TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "fileUrl"     TEXT         NOT NULL,
    "storagePath" TEXT         NOT NULL,
    "source"      TEXT         NOT NULL DEFAULT 'manual',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"   TEXT,

    CONSTRAINT "TenderFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TenderFile_projectId_idx" ON "TenderFile"("projectId");
CREATE INDEX IF NOT EXISTS "TenderFile_tenderId_idx" ON "TenderFile"("tenderId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TenderFile_projectId_fkey'
    ) THEN
        ALTER TABLE "TenderFile"
            ADD CONSTRAINT "TenderFile_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "Project" DROP COLUMN IF EXISTS "tenderDocuments";
