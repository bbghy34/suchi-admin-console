-- Daily tender status: pending by default, saved, or reject.
ALTER TABLE "DailyTenders" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "SavedTenders" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
