# Vercel Deployment for Aurum Client

This file explains how to deploy the `client/` app as a standalone frontend on Vercel.
For the full-stack Vercel deployment (including the API), follow
[`docs/DEPLOY_VERCEL_SUPABASE.md`](../docs/DEPLOY_VERCEL_SUPABASE.md) and set
Vercel's Root Directory to the repository root, not `client/`.

## Deploying the Frontend
1. In Vercel, import the repository and select the `client/` folder as the root.
2. Use the following build settings:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`

This frontend-only setup does not deploy the Express API. Configure `VITE_API_URL`
to point to a separately deployed backend. To deploy both frontend and API on
Vercel, use the repository-root setup linked above.

## Environment Variables
Set this variable in Vercel:
- `VITE_API_URL` — the base URL of your backend, for example `https://aurum-api.vercel.app`.

## Notes
- Local development uses `client/.env.example` and the Vite default proxy behavior.
- In production, the frontend will call the backend through the configured `VITE_API_URL`.
