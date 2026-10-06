CREATE TYPE "QuoteService" AS ENUM ('TAKE_OFF','ESTIMATE','TENDER_SUPPORT','COMMERCIAL_SUPPORT','BOQ','VARIATION','VALUATION','OTHER');
CREATE TYPE "QuoteStatus" AS ENUM ('NEW','REVIEWING','QUOTED','ACCEPTED','IN_PROGRESS','COMPLETED','DECLINED');

CREATE TABLE "QuoteRequest" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "telephone" TEXT,
  "projectName" TEXT NOT NULL,
  "projectLocation" TEXT,
  "service" "QuoteService" NOT NULL,
  "tenderDeadline" TIMESTAMP(3),
  "briefDescription" TEXT,
  "status" "QuoteStatus" NOT NULL DEFAULT 'NEW',
  "requiredDelivery" TIMESTAMP(3),
  "fee" DOUBLE PRECISION,
  "notes" TEXT,
  "clientRequirements" TEXT,
  "requiredTrades" TEXT,
  "missingInformation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuoteRequest_status_tenderDeadline_idx" ON "QuoteRequest"("status","tenderDeadline");
CREATE INDEX "QuoteRequest_email_idx" ON "QuoteRequest"("email");

CREATE TABLE "QuoteDocument" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuoteDocument_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "QuoteDocument_quoteId_idx" ON "QuoteDocument"("quoteId");

CREATE TABLE "InvoiceSequence" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "current" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);
INSERT INTO "InvoiceSequence" ("id","current") VALUES (1,0) ON CONFLICT DO NOTHING;

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "quoteId" TEXT,
  "clientName" TEXT NOT NULL,
  "company" TEXT,
  "email" TEXT NOT NULL,
  "projectName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "vatRate" DOUBLE PRECISION,
  "vatAmount" DOUBLE PRECISION,
  "total" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "status" TEXT NOT NULL DEFAULT 'UNPAID',
  "dueDate" TIMESTAMP(3),
  "paymentUrl" TEXT,
  "stripeSession" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_invoiceNumber_key" UNIQUE ("invoiceNumber"),
  CONSTRAINT "Invoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Invoice_email_status_idx" ON "Invoice"("email","status");

CREATE TABLE "BusinessSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessSetting_pkey" PRIMARY KEY ("key")
);
