-- Store uploaded file content in the database so documents survive
-- serverless deploys (Vercel's disk is ephemeral)
ALTER TABLE "Document" ADD COLUMN "data" BYTEA;
