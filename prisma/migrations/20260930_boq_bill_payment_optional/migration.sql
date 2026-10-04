-- Bill payment and its date can be left blank on a BOQ bill.
ALTER TABLE "BoqBill" ALTER COLUMN "billPayment" DROP NOT NULL;
ALTER TABLE "BoqBill" ALTER COLUMN "billPaymentDate" DROP NOT NULL;
