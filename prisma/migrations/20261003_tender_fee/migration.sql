-- Tender fee (whole rupees), optional so existing tenders stay valid
ALTER TABLE "DailyTenders" ADD COLUMN IF NOT EXISTS "tenderFee" BIGINT;

ALTER TABLE "SavedTenders" ADD COLUMN IF NOT EXISTS "tenderFee" BIGINT;
