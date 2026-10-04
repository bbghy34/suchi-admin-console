CREATE TABLE "DeskRetrievalArtifact" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeskRetrievalArtifact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeskRetrievalArtifact_ownerId_requestId_idx" ON "DeskRetrievalArtifact"("ownerId", "requestId");
CREATE UNIQUE INDEX "DeskRetrievalArtifact_ownerId_requestId_sha256_key" ON "DeskRetrievalArtifact"("ownerId", "requestId", "sha256");
