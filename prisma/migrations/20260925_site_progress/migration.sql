-- Site progress photos stored in Google Cloud, with GPS coordinates.
-- Project and Site ids in this app are UUIDs, so these foreign keys are text.
CREATE TABLE IF NOT EXISTS "Progress" (
    "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "projectId" TEXT         NOT NULL,
    "siteId"    TEXT         NOT NULL,
    "images"    TEXT         NOT NULL,
    "latitude"  DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "isActive"  BOOLEAN      NOT NULL DEFAULT true,

    CONSTRAINT "Progress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Progress_projectId_idx" ON "Progress"("projectId");
CREATE INDEX IF NOT EXISTS "Progress_siteId_idx" ON "Progress"("siteId");

ALTER TABLE "Progress"
    ADD CONSTRAINT "Progress_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Progress"
    ADD CONSTRAINT "Progress_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
