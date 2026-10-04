-- Treasury bill documents are an array of images: [{ "name", "path" }].
ALTER TABLE "ProjectPayment"
    ADD COLUMN IF NOT EXISTS "treasuryBillDocs" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "ProjectPayment"
SET "treasuryBillDocs" = jsonb_build_array(
    jsonb_build_object(
        'name', "treasuryBillDoc",
        'path', COALESCE("treasuryBillPath", '')
    )
)
WHERE COALESCE("treasuryBillDocs", '[]'::jsonb) = '[]'::jsonb
  AND COALESCE("treasuryBillDoc", '') <> '';

ALTER TABLE "ProjectPayment" DROP COLUMN IF EXISTS "treasuryBillDoc";
ALTER TABLE "ProjectPayment" DROP COLUMN IF EXISTS "treasuryBillPath";
