CREATE TABLE IF NOT EXISTS "DeskOnlineHit" (
  "id" TEXT PRIMARY KEY,
  "query" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "link" TEXT NOT NULL UNIQUE,
  "site" TEXT,
  "detail" TEXT,
  "eligibility" TEXT,
  "documentsJson" TEXT,
  "fetchedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "DeskOnlineHitTemp" (
  "id" TEXT PRIMARY KEY,
  "query" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "site" TEXT,
  "detail" TEXT,
  "eligibility" TEXT,
  "documentsJson" TEXT,
  "fetchedAt" TIMESTAMP NOT NULL,
  "archivedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
