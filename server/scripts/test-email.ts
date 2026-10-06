/**
 * Sends a test email through the exact same SMTP configuration the app uses,
 * and prints the provider's verbatim error on failure — so email problems
 * surface here instead of dying silently in a fire-and-forget notification.
 *
 * Usage (from the server folder):
 *   npm run email:test -- you@example.com
 *
 * Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM from .env.
 */
import dotenv from 'dotenv'
import { sendTestEmail } from '../src/services/emailService'

dotenv.config()

const to = process.argv[2]
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('\nUsage: npm run email:test -- you@example.com\n')
  process.exit(1)
}

const host = process.env.SMTP_HOST || 'smtp.resend.com (default)'
const port = Number(process.env.SMTP_PORT) || 587
const from = process.env.SMTP_FROM || `${process.env.SMTP_USER} (from SMTP_USER)`
console.log(`\nConfig: host=${host} port=${port} from=${from}`)
console.log(`        SMTP_USER set=${Boolean(process.env.SMTP_USER)}  SMTP_PASS set=${Boolean(process.env.SMTP_PASS)} (values hidden)\n`)
console.log(`Sending test email to ${to} ...`)

sendTestEmail(to)
  .then((result) => {
    console.log('\n✅ SENT')
    console.log(`   messageId: ${result.messageId}`)
    console.log(`   server response: ${result.response}`)
    if (result.rejected.length > 0) console.log(`   rejected: ${result.rejected.join(', ')}`)
    console.log('\nIf it arrived, invitations / resets / deadline alerts will work too.\n')
    process.exit(0)
  })
  .catch((err: { message?: string; code?: string; response?: string; command?: string }) => {
    console.error('\n❌ FAILED — the SMTP server said:')
    console.error(`   message:  ${err.message}`)
    if (err.code) console.error(`   code:     ${err.code}`)
    if (err.command) console.error(`   command:  ${err.command}`)
    if (err.response) console.error(`   response: ${err.response}`)
    console.error('\nCommon causes:')
    console.error('   550 / "not verified"  -> the sending domain is not Verified in Resend → Domains')
    console.error('   401 / auth failed     -> SMTP_USER must be the literal "resend", SMTP_PASS the API key')
    console.error('   connection timeout    -> wrong SMTP_HOST or the port is blocked\n')
    process.exit(1)
  })
