-- Manual tender packs live on the existing Project row, beside tenderId.
-- Nullable so current projects stay unchanged until an admin uploads a file.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "tenderDocuments" JSONB;
