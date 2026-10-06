-- NEC deadline clocks: cl. 61.3 awareness date (8-week time bar) and
-- cl. 62.3 quotation deadline
ALTER TABLE "CompensationEvent" ADD COLUMN "dateAwareness" TIMESTAMP(3);
ALTER TABLE "CompensationEvent" ADD COLUMN "dateQuotationDue" TIMESTAMP(3);
