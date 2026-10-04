-- EMD through (online/offline) and EMD mode (cheque, bank guarantee, demand draft, fixed deposit)
ALTER TABLE "DailyTenders" ADD COLUMN IF NOT EXISTS "emdThrough" TEXT;
ALTER TABLE "DailyTenders" ADD COLUMN IF NOT EXISTS "emdMode" TEXT;

ALTER TABLE "SavedTenders" ADD COLUMN IF NOT EXISTS "emdThrough" TEXT;
ALTER TABLE "SavedTenders" ADD COLUMN IF NOT EXISTS "emdMode" TEXT;
