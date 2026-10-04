-- Construction warehouse: materials, stock, suppliers, and movements.

CREATE TABLE "MaterialCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "gstNumber" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Material" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");
CREATE INDEX "Material_categoryId_idx" ON "Material"("categoryId");
CREATE INDEX "Material_unitId_idx" ON "Material"("unitId");

CREATE TABLE "Stock" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Stock_materialId_key" ON "Stock"("materialId");

CREATE TABLE "StockLedger" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "movement" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "balanceAfter" DOUBLE PRECISION NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockLedger_materialId_idx" ON "StockLedger"("materialId");
CREATE INDEX "StockLedger_createdAt_idx" ON "StockLedger"("createdAt");

CREATE TABLE "StockAdjustment" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockAdjustment_materialId_idx" ON "StockAdjustment"("materialId");

CREATE TABLE "MaterialInward" (
  "id" TEXT NOT NULL,
  "grnNumber" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remarks" TEXT,
  "createdBy" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "MaterialInward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialInward_grnNumber_key" ON "MaterialInward"("grnNumber");
CREATE INDEX "MaterialInward_materialId_idx" ON "MaterialInward"("materialId");
CREATE INDEX "MaterialInward_supplierId_idx" ON "MaterialInward"("supplierId");

CREATE TABLE "MaterialRequest" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "projectId" TEXT,
  "siteId" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "requestedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaterialRequest_materialId_idx" ON "MaterialRequest"("materialId");
CREATE INDEX "MaterialRequest_status_idx" ON "MaterialRequest"("status");

CREATE TABLE "MaterialOutward" (
  "id" TEXT NOT NULL,
  "issueNumber" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "projectId" TEXT,
  "siteId" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "purpose" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" TEXT,
  "createdBy" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "MaterialOutward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialOutward_issueNumber_key" ON "MaterialOutward"("issueNumber");
CREATE UNIQUE INDEX "MaterialOutward_requestId_key" ON "MaterialOutward"("requestId");
CREATE INDEX "MaterialOutward_materialId_idx" ON "MaterialOutward"("materialId");
CREATE INDEX "MaterialOutward_projectId_idx" ON "MaterialOutward"("projectId");

ALTER TABLE "Material" ADD CONSTRAINT "Material_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "Material_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialInward" ADD CONSTRAINT "MaterialInward_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialInward" ADD CONSTRAINT "MaterialInward_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialOutward" ADD CONSTRAINT "MaterialOutward_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialOutward" ADD CONSTRAINT "MaterialOutward_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialOutward" ADD CONSTRAINT "MaterialOutward_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialOutward" ADD CONSTRAINT "MaterialOutward_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaterialRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
