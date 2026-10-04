-- When a saved tender was marked Win, Loss, or Cancelled. EMD and SD tracking count from it.
ALTER TABLE "SavedTenders" ADD COLUMN IF NOT EXISTS "resultDate" DATE;
