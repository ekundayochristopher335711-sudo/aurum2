import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import Button from './Button'
import { verifyPassword } from '../../api/auth'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
  /** Ask for the signed-in user's password before allowing the action. */
  requirePassword?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', loading,
  requirePassword, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  // Never leave a typed password sitting in memory once the dialog closes
  useEffect(() => {
    if (!open) { setPassword(''); setError(''); setChecking(false) }
  }, [open])

  if (!open) return null

  const proceed = async () => {
    if (!requirePassword) { onConfirm(); return }
    if (!password) { setError('Enter your password to continue'); return }
    setChecking(true)
    setError('')
    try {
      await verifyPassword(password)
      setPassword('')
      onConfirm()
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setError(status === 429
        ? 'Too many attempts. Please wait a few minutes.'
        : 'Incorrect password. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            {requirePassword
              ? <ShieldAlert className="w-5 h-5 text-red-500" />
              : <AlertTriangle className="w-5 h-5 text-red-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        {requirePassword && (
          <form
            className="mt-5"
            onSubmit={(e) => { e.preventDefault(); proceed() }}
          >
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Confirm your password to continue
            </label>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Your password"
              className={`w-full px-3 py-2 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-red-400/40 ${
                error ? 'border-red-400 bg-red-50' : 'border-slate-200'
              }`}
            />
            {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
          </form>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            variant="danger"
            loading={loading || checking}
            disabled={requirePassword && !password}
            onClick={proceed}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
