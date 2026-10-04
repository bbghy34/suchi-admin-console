-- Bill numbers are capital letters and digits, not integers.
ALTER TABLE "ProjectPayment"
    ALTER COLUMN "billNo" TYPE TEXT USING "billNo"::text;

ALTER TABLE "BoqBill"
    ALTER COLUMN "billNo" TYPE TEXT USING "billNo"::text;
