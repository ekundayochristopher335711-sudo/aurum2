import cron from 'node-cron'
import app from './app'
import { sendOverdueNotifications } from './services/emailService'

const PORT = process.env.PORT || 5000

// Traditional always-on host (local dev, Render, Railway, Docker).
// On Vercel the app is imported by api/index.ts and this file is never run.
cron.schedule('0 8 * * *', () => {
  sendOverdueNotifications().catch(console.error)
})

app.listen(PORT, () => {
  console.log(`Aurum Project Controls API - port ${PORT}`)
})

export default app
