-- File bytes live in Postgres. The production app cannot create a data folder on disk.

CREATE TABLE IF NOT EXISTS "DeskDocumentFile" (
    "documentId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    CONSTRAINT "DeskDocumentFile_pkey" PRIMARY KEY ("documentId")
);

DO $$ BEGIN
  ALTER TABLE "DeskDocumentFile"
    ADD CONSTRAINT "DeskDocumentFile_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "DeskDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
