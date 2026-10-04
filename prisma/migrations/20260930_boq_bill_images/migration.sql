-- BOQ bill images are stored as an array: [{ "name", "path" }].
ALTER TABLE "BoqBill"
    ADD COLUMN IF NOT EXISTS "billDocs" JSONB NOT NULL DEFAULT '[]'::jsonb;
