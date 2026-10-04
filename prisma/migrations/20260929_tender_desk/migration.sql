-- Tender Desk tables inside the operations console.
-- Separate from TenderFile and Project.tenderId.

CREATE TABLE IF NOT EXISTS "DeskPerson" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "name" TEXT NOT NULL,
    "roles" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL DEFAULT 'console',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeskPerson_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeskPerson_employeeId_key" ON "DeskPerson"("employeeId");

CREATE TABLE IF NOT EXISTS "DeskSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "DeskSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "DeskFetchAssignment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeskFetchAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeskSource" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "officialName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "extraUrls" TEXT,
    "mark" TEXT NOT NULL,
    "markNote" TEXT,
    "intakeRule" TEXT NOT NULL,
    "allIndia" BOOLEAN NOT NULL DEFAULT false,
    "isDaily" BOOLEAN NOT NULL DEFAULT true,
    "groupKey" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'GEPNIC',
    "noNewLabel" TEXT NOT NULL DEFAULT 'No new tender',
    "config" TEXT,
    CONSTRAINT "DeskSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeskFetchLog" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "personId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeskFetchLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeskFetchLog_sourceId_date_key" ON "DeskFetchLog"("sourceId", "date");

CREATE TABLE IF NOT EXISTS "DeskTender" (
    "id" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT,
    "allIndia" BOOLEAN NOT NULL DEFAULT false,
    "placeOfWork" TEXT,
    "placeOfWorkState" TEXT,
    "portalTenderId" TEXT,
    "referenceNo" TEXT,
    "orgChain" TEXT,
    "category" TEXT,
    "workCategory" TEXT,
    "scheme" TEXT,
    "estimatedValue" DOUBLE PRECISION,
    "emdAmount" DOUBLE PRECISION,
    "emdMode" TEXT,
    "tenderFee" DOUBLE PRECISION,
    "publishedAt" TIMESTAMP(3),
    "docSaleEnd" TIMESTAMP(3),
    "bidSubmissionEnd" TIMESTAMP(3) NOT NULL,
    "bidOpeningAt" TIMESTAMP(3),
    "bidOpeningPlace" TEXT,
    "preBidAt" TIMESTAMP(3),
    "preBidPlace" TEXT,
    "periodOfWorkDays" INTEGER,
    "bidValidityDays" INTEGER,
    "location" TEXT,
    "district" TEXT,
    "pinCode" TEXT,
    "nodalOfficer" TEXT,
    "nodalPhone" TEXT,
    "sourceUrl" TEXT,
    "description" TEXT,
    "gemBidNumber" TEXT,
    "gemBuyer" TEXT,
    "gemConsigneeState" TEXT,
    "gemRa" TEXT,
    "uploadAnywayReason" TEXT,
    "linkedTenderId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'UPLOADED',
    "awardDate" TIMESTAMP(3),
    "awardedValue" DOUBLE PRECISION,
    "completionCertNo" TEXT,
    "completionDate" TIMESTAMP(3),
    "completionAuthority" TEXT,
    "completionNote" TEXT,
    "completionSavedAt" TIMESTAMP(3),
    "summaryJson" TEXT,
    "summaryAt" TIMESTAMP(3),
    "summaryFiles" TEXT,
    "summaryError" TEXT,
    "summaryBusy" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeskTender_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeskTender_sourceId_portalTenderId_key" ON "DeskTender"("sourceId", "portalTenderId");

CREATE TABLE IF NOT EXISTS "DeskDocument" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT,
    "mime" TEXT,
    "size" INTEGER,
    "docDate" TIMESTAMP(3),
    "extractedText" TEXT,
    "textStatus" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeskDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeskSelection" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'FREQUENT',
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeskSelection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeskSelection_tenderId_personId_key" ON "DeskSelection"("tenderId", "personId");

CREATE TABLE IF NOT EXISTS "DeskChecklistItem" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "fromSummary" BOOLEAN NOT NULL DEFAULT true,
    "sourceFile" TEXT,
    "addedById" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DeskChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeskChecklistTick" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeskChecklistTick_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeskChecklistTick_itemId_personId_key" ON "DeskChecklistTick"("itemId", "personId");

CREATE TABLE IF NOT EXISTS "DeskRefundApplication" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "letterText" TEXT NOT NULL,
    "officeName" TEXT NOT NULL,
    "officeDept" TEXT,
    "officeAddress" TEXT,
    "officeDistrict" TEXT,
    "officeState" TEXT,
    "officerName" TEXT,
    "sentOn" TIMESTAMP(3),
    "ackOn" TIMESTAMP(3),
    "ackDocumentId" TEXT,
    "releasedOn" TIMESTAMP(3),
    "rejectNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeskRefundApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeskInstrument" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inFavourOf" TEXT,
    "bank" TEXT,
    "branch" TEXT,
    "number" TEXT,
    "instrumentDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "submittedOn" TIMESTAMP(3),
    "submittedToName" TEXT,
    "submittedToDept" TEXT,
    "submittedToDistrict" TEXT,
    "submittedToState" TEXT,
    "proofDocumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TO_ARRANGE',
    "note" TEXT,
    "convertedToId" TEXT,
    "refundOfficeName" TEXT,
    "refundOfficeDept" TEXT,
    "refundOfficeAddress" TEXT,
    "refundOfficeDistrict" TEXT,
    "refundOfficeState" TEXT,
    "refundOfficerName" TEXT,
    "refundOfficePhone" TEXT,
    "refundOfficeEmail" TEXT,
    "refundedOn" TIMESTAMP(3),
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeskInstrument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeskNotification" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tenderId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dedupeKey" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "DeskNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeskNotification_dedupeKey_key" ON "DeskNotification"("dedupeKey");
CREATE INDEX IF NOT EXISTS "DeskNotification_personId_readAt_idx" ON "DeskNotification"("personId", "readAt");

CREATE TABLE IF NOT EXISTS "DeskActivity" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT,
    "personId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeskActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DeskActivity_tenderId_at_idx" ON "DeskActivity"("tenderId", "at");

ALTER TABLE "DeskFetchAssignment" DROP CONSTRAINT IF EXISTS "DeskFetchAssignment_personId_fkey";
ALTER TABLE "DeskFetchAssignment" ADD CONSTRAINT "DeskFetchAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DeskPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeskFetchLog" DROP CONSTRAINT IF EXISTS "DeskFetchLog_sourceId_fkey";
ALTER TABLE "DeskFetchLog" ADD CONSTRAINT "DeskFetchLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DeskSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeskFetchLog" DROP CONSTRAINT IF EXISTS "DeskFetchLog_personId_fkey";
ALTER TABLE "DeskFetchLog" ADD CONSTRAINT "DeskFetchLog_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DeskPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeskTender" DROP CONSTRAINT IF EXISTS "DeskTender_sourceId_fkey";
ALTER TABLE "DeskTender" ADD CONSTRAINT "DeskTender_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DeskSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeskDocument" DROP CONSTRAINT IF EXISTS "DeskDocument_tenderId_fkey";
ALTER TABLE "DeskDocument" ADD CONSTRAINT "DeskDocument_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "DeskTender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeskDocument" DROP CONSTRAINT IF EXISTS "DeskDocument_uploadedById_fkey";
ALTER TABLE "DeskDocument" ADD CONSTRAINT "DeskDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "DeskPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeskSelection" DROP CONSTRAINT IF EXISTS "DeskSelection_tenderId_fkey";
ALTER TABLE "DeskSelection" ADD CONSTRAINT "DeskSelection_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "DeskTender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeskSelection" DROP CONSTRAINT IF EXISTS "DeskSelection_personId_fkey";
ALTER TABLE "DeskSelection" ADD CONSTRAINT "DeskSelection_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DeskPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeskChecklistItem" DROP CONSTRAINT IF EXISTS "DeskChecklistItem_tenderId_fkey";
ALTER TABLE "DeskChecklistItem" ADD CONSTRAINT "DeskChecklistItem_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "DeskTender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeskChecklistTick" DROP CONSTRAINT IF EXISTS "DeskChecklistTick_itemId_fkey";
ALTER TABLE "DeskChecklistTick" ADD CONSTRAINT "DeskChecklistTick_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DeskChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeskChecklistTick" DROP CONSTRAINT IF EXISTS "DeskChecklistTick_personId_fkey";
ALTER TABLE "DeskChecklistTick" ADD CONSTRAINT "DeskChecklistTick_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DeskPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeskRefundApplication" DROP CONSTRAINT IF EXISTS "DeskRefundApplication_tenderId_fkey";
ALTER TABLE "DeskRefundApplication" ADD CONSTRAINT "DeskRefundApplication_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "DeskTender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeskInstrument" DROP CONSTRAINT IF EXISTS "DeskInstrument_tenderId_fkey";
ALTER TABLE "DeskInstrument" ADD CONSTRAINT "DeskInstrument_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "DeskTender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeskInstrument" DROP CONSTRAINT IF EXISTS "DeskInstrument_applicationId_fkey";
ALTER TABLE "DeskInstrument" ADD CONSTRAINT "DeskInstrument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "DeskRefundApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeskNotification" DROP CONSTRAINT IF EXISTS "DeskNotification_personId_fkey";
ALTER TABLE "DeskNotification" ADD CONSTRAINT "DeskNotification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DeskPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeskNotification" DROP CONSTRAINT IF EXISTS "DeskNotification_tenderId_fkey";
ALTER TABLE "DeskNotification" ADD CONSTRAINT "DeskNotification_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "DeskTender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeskActivity" DROP CONSTRAINT IF EXISTS "DeskActivity_tenderId_fkey";
ALTER TABLE "DeskActivity" ADD CONSTRAINT "DeskActivity_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "DeskTender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeskActivity" DROP CONSTRAINT IF EXISTS "DeskActivity_personId_fkey";
ALTER TABLE "DeskActivity" ADD CONSTRAINT "DeskActivity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DeskPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
