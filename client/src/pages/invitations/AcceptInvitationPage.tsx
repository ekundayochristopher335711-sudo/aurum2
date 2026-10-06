import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getInvitationPreview, acceptInvitation, InvitationPreview } from '../../api/invitations'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  COMMERCIAL_MANAGER: 'Commercial Manager',
  VIEWER: 'Viewer',
}

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!token) return
    getInvitationPreview(token)
      .then(setPreview)
      .catch(() => setLoadError('This invitation link is invalid or has expired.'))
  }, [token])

  const onSubmit = async (data: FormData) => {
    try {
      setServerError('')
      await acceptInvitation(token!, data.name, data.password)
      setSuccess(true)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setServerError(msg || 'Failed to create account. Please try again.')
    }
  }

  if (loadError) return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Invalid Invitation</h2>
        <p className="text-sm text-slate-500">{loadError}</p>
      </div>
    </div>
  )

  if (success) return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="w-14 h-14 rounded-full gradient-brand flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-7 h-7 text-navy-900" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Account created!</h2>
        <p className="text-sm text-slate-500 mb-6">
          You now have access to <strong>{preview?.projectName}</strong>. Sign in to get started.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="w-full py-2.5 rounded-lg gradient-brand text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Go to Sign In
        </button>
      </div>
    </div>
  )

  if (!preview) return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-brand-green animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="Aurum" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white">You're invited</h1>
          <p className="text-slate-400 text-sm mt-2">
            Join <span className="text-white font-medium">{preview.projectName}</span> as{' '}
            <span className="text-brand-green font-medium">{roleLabels[preview.role] ?? preview.role}</span>
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-sm">
            <p className="text-slate-500">Signing up with</p>
            <p className="font-semibold text-slate-900 mt-0.5">{preview.email}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Your full name</label>
              <input
                type="text"
                placeholder="John Smith"
                className={`w-full px-3.5 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green/40 ${errors.name ? 'border-red-400' : 'border-slate-200'}`}
                {...register('name')}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Create a password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                className={`w-full px-3.5 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green/40 ${errors.password ? 'border-red-400' : 'border-slate-200'}`}
                {...register('password')}
              />
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
              <input
                type="password"
                placeholder="Repeat password"
                className={`w-full px-3.5 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green/40 ${errors.confirmPassword ? 'border-red-400' : 'border-slate-200'}`}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>}
            </div>

            {serverError && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600">{serverError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-lg gradient-brand text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isSubmitting ? 'Creating account…' : 'Create account & join project'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
