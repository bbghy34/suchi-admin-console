-- Download jobs live in DeskSetting as JSON under portalImport:job:<id>.
-- Index only those rows, by owner and creation time, so listing a user's
-- downloads reads a few index entries instead of every settings row.
-- The CASE guard matches the query in lib/desk/portal-import/jobs.mjs and
-- keeps non-JSON settings values from ever being cast.
CREATE INDEX IF NOT EXISTS "DeskSetting_import_job_owner_created_idx" ON "DeskSetting" (
  (CASE WHEN "key" LIKE 'portalImport:job:%' THEN "value"::jsonb->>'ownerId' END),
  (CASE WHEN "key" LIKE 'portalImport:job:%' THEN "value"::jsonb->>'createdAt' END) DESC
) WHERE "key" LIKE 'portalImport:job:%';
