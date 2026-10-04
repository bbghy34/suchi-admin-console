-- Result can be empty, a win, or a loss. Older checked rows stay wins.
ALTER TABLE "DailyTenders" ALTER COLUMN "isWin" DROP NOT NULL;
ALTER TABLE "DailyTenders"
    ALTER COLUMN "isWin" TYPE TEXT USING (CASE WHEN "isWin" IS TRUE THEN 'win' ELSE NULL END);

ALTER TABLE "SavedTenders" ALTER COLUMN "isWin" DROP NOT NULL;
ALTER TABLE "SavedTenders"
    ALTER COLUMN "isWin" TYPE TEXT USING (CASE WHEN "isWin" IS TRUE THEN 'win' ELSE NULL END);
