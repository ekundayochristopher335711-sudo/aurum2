FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
# tsx + prisma are needed at runtime (the app runs from TypeScript source)
RUN npm ci
COPY . .
RUN npx prisma generate

EXPOSE 5000
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npx tsx src/index.ts"]
