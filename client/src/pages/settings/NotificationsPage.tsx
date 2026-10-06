import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, FileWarning, MessageSquare, KeyRound } from 'lucide-react'
import { getMe, updateNotificationPrefs, changePassword } from '../../api/auth'
import { useToast } from '../../components/ui/Toast'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${checked ? 'bg-gold-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function ChangePassword() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      toast.success('Password changed')
      setCurrent(''); setNext(''); setConfirm(''); setError('')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Could not change your password.')
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return }
    if (next !== confirm) { setError('The new passwords do not match.'); return }
    mutation.mutate()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 mt-6">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-navy-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Change password</p>
          <p className="text-xs text-slate-500 mt-1">Choose something at least 8 characters long.</p>

          <form onSubmit={submit} className="mt-4 space-y-3 max-w-sm">
            <Input label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            <Button type="submit" size="sm" loading={mutation.isPending} disabled={!current || !next || !confirm}>
              Update password
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: getMe })

  const mutation = useMutation({
    mutationFn: updateNotificationPrefs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      toast.success('Notification settings saved')
    },
    onError: () => toast.error('Could not save your settings.'),
  })

  const rows = [
    {
      key: 'notifyContractEvents' as const,
      icon: FileWarning,
      title: 'Contract events',
      description:
        'Early warnings raised, compensation events notified, notices issued, CE status changes, and the daily deadline digest. These are contractual - missing one can cost money.',
      recommended: 'Recommended: keep on',
    },
    {
      key: 'notifyComments' as const,
      icon: MessageSquare,
      title: 'Comments and discussion',
      description:
        'An email each time someone comments on this project or one of its records. Turn this off if the conversation is busy and you would rather read it in the app.',
      recommended: '',
    },
  ]

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Choose what Aurum emails you, and manage your password.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card divide-y divide-slate-100">
          {rows.map(({ key, icon: Icon, title, description, recommended }) => (
            <div key={key} className="p-5 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-gold-50 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-gold-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
                {recommended && <p className="text-xs text-emerald-600 mt-1.5 font-medium">{recommended}</p>}
              </div>
              <Toggle
                checked={me?.[key] !== false}
                disabled={mutation.isPending}
                onChange={(v) => mutation.mutate({ [key]: v })}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
        <Bell className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
        <p>
          Deadline reminders for overdue and upcoming compensation events are part of contract events.
          Turning those off means you will not be warned before a contractual deadline passes.
        </p>
      </div>

      <ChangePassword />
    </div>
  )
}
