-- Align existing source records with the requested all-India intake scope.
UPDATE "DeskSource"
SET "allIndia" = true,
    "intakeRule" = 'All India, in the firm’s work categories. Retrieve selected tenders on demand.'
WHERE "id" IN ('cppp', 'defence', 'coal-india', 'cpse', 'nbcc');
UPDATE "DeskSource" SET "url" = 'https://www.sikkim.gov.in/tender', "kind" = 'NOTICE'
WHERE "id" = 'sikkim' AND "url" = 'https://sikkimtenders.gov.in/nicgep/app';
UPDATE "DeskSource" SET "url" = 'https://pmgsytenders.gov.in/nicgep/app',
"intakeRule" = 'Check the PMGSY portal and state notices. Link an existing tender instead of uploading the same NIT twice; tag it PMGSY.'
WHERE "id" = 'pmgsy';
ALTER TABLE "DeskTender" ADD COLUMN IF NOT EXISTS "sdReleaseEligibleAt" TIMESTAMP(3);
ALTER TABLE "DeskTender" ADD COLUMN IF NOT EXISTS "sdReleaseConditions" TEXT;
