# Vercel Deployment for Aurum Client

This file explains how to deploy the `client/` app to Vercel and configure it to work with the backend.

## Deploying the Frontend
1. In Vercel, import the repository and select the `client/` folder as the root.
2. Use the following build settings:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`

## Environment Variables
Set this variable in Vercel:
- `VITE_API_URL` — the base URL of your backend, for example `https://aurum-api.vercel.app`.

## Notes
- Local development uses `client/.env.example` and the Vite default proxy behavior.
- In production, the frontend will call the backend through the configured `VITE_API_URL`.
