-- How the security deposit was given: through online/offline, mode cheque/bank_guarantee/demand_draft/fixed_deposit.
ALTER TABLE "DailyTenders" ADD COLUMN IF NOT EXISTS "sdThrough" TEXT;
ALTER TABLE "DailyTenders" ADD COLUMN IF NOT EXISTS "sdMode" TEXT;

ALTER TABLE "SavedTenders" ADD COLUMN IF NOT EXISTS "sdThrough" TEXT;
ALTER TABLE "SavedTenders" ADD COLUMN IF NOT EXISTS "sdMode" TEXT;
