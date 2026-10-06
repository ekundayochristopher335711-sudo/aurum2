import type { IncomingMessage, ServerResponse } from 'http'
import app from '../server/src/app'

// Vercel serverless entry point. All /api/* requests are routed here by
// vercel.json and handed to the Express app unchanged.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Safety net: if Vercel ever strips the /api prefix before invoking the
  // function, restore it so the Express routes (mounted under /api) still match.
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (app as any)(req, res)
}
