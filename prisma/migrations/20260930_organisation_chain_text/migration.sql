-- Organisation chain is text, not a whole number.
ALTER TABLE "DailyTenders"
    ALTER COLUMN "organisationChain" TYPE TEXT USING "organisationChain"::text;

ALTER TABLE "SavedTenders"
    ALTER COLUMN "organisationChain" TYPE TEXT USING "organisationChain"::text;
