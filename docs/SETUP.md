# Aurum Project Controls — Setup Guide

## Prerequisites
- Node.js 20+
- PostgreSQL 14+ (or Docker)
- npm 9+

---

## Quick Start (with Docker for the database)

### 1. Start the PostgreSQL database
```bash
docker-compose up postgres -d
```

### 2. Set up the server
```bash
cd server
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET
npm install
npm run db:migrate   # runs Prisma migrations
npm run db:seed      # creates demo users + project
npm run dev          # starts on http://localhost:5000
```

### 3. Set up the client
```bash
cd client
npm install
npm run dev          # starts on http://localhost:5173
```

### Or run both together from root:
```bash
npm install
npm run dev
```

---

## Deploying to Vercel + Supabase
This repo uses separate frontend and backend folders so you can deploy the React client on Vercel and point the server at Supabase Postgres.

### Frontend (Vercel)
- Deploy the `client/` folder as a Vite app.
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` in Vercel to your backend URL, for example `https://aurum-api.example.com`

### Backend
- Deploy the `server/` folder to any Node host that supports Express.
- Use Supabase Postgres for `DATABASE_URL`.
- Keep `JWT_SECRET` and `CLIENT_URL` configured in the host environment.

### Environment variables
For the frontend on Vercel:
- `VITE_API_URL` = backend URL

For the backend:
- `DATABASE_URL` = Supabase Postgres URL
- `JWT_SECRET` = secure JWT signing secret
- `CLIENT_URL` = Vercel frontend URL
- `PORT` = optional backend port

---

## Environment Variables (server/.env)

| Variable      | Default                                              | Description           |
|---------------|------------------------------------------------------|-----------------------|
| DATABASE_URL  | postgresql://aurum:aurum_secret@localhost:5432/aurum_db | PostgreSQL connection |
| DIRECT_URL    | (same as DATABASE_URL locally)                       | Non-pooled connection used by migrations |
| JWT_SECRET    | (required)                                           | JWT signing secret    |
| CLIENT_URL    | http://localhost:5173                               | CORS allowed origin + links in emails |
| PORT          | 5000                                                | API server port       |
| SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS | (optional) | Email provider — Resend: `smtp.resend.com`, port `587`, user `resend`, pass = Resend API key |
| SMTP_FROM     | (optional)                                           | Verified sender address, e.g. `notifications@aurumite.com` |
| CRON_SECRET   | (optional)                                           | Protects the Vercel Cron endpoint `/api/cron/overdue` |

---

## Demo Credentials (after seeding)

| Role               | Email                  | Password      |
|--------------------|------------------------|---------------|
| Admin              | admin@aurum.com        | Admin1234!    |
| Commercial Manager | manager@aurum.com      | Manager1234!  |

---

## NEC Workflow (Compensation Events)
```
NOTIFIED → QUOTED → ASSESSED → IMPLEMENTED → CLOSED
```

## Clause References
- Early Warning: NEC4 clause 15.1
- Compensation Events: NEC4 clauses 60–66

---

## API Endpoints Summary

### Auth
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET  /api/auth/me`

### Projects
- `GET  /api/projects`
- `POST /api/projects`
- `GET  /api/projects/:id`
- `PUT  /api/projects/:id`

### Early Warnings
- `GET  /api/projects/:id/early-warnings`
- `POST /api/projects/:id/early-warnings`
- `PUT  /api/projects/:id/early-warnings/:ewId`
- `DELETE /api/projects/:id/early-warnings/:ewId`

### Risk Register
- `GET  /api/projects/:id/risks`
- `POST /api/projects/:id/risks`
- `PUT  /api/projects/:id/risks/:rId`
- `DELETE /api/projects/:id/risks/:rId`

### Compensation Events
- `GET  /api/projects/:id/compensation-events`
- `POST /api/projects/:id/compensation-events`
- `PUT  /api/projects/:id/compensation-events/:ceId`
- `DELETE /api/projects/:id/compensation-events/:ceId`
- `POST /api/projects/:id/compensation-events/:ceId/documents`

### Notices
- `GET  /api/projects/:id/notices`
- `POST /api/projects/:id/notices`
- `GET  /api/projects/:id/notices/:nId/pdf`
- `DELETE /api/projects/:id/notices/:nId`

### Dashboard & Reports
- `GET  /api/projects/:id/dashboard`
- `GET  /api/projects/:id/audit-log`
- `GET  /api/projects/:id/reports/commercial`
- `GET  /api/projects/:id/reports/ce-summary`
- `GET  /api/projects/:id/reports/risk-register`
