import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle } from 'lucide-react'
import { resetPassword } from '../../api/auth'
import LogoSpinner from '../../components/ui/LogoSpinner'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setServerError('')
      await resetPassword(token!, data.password)
      setDone(true)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setServerError(msg || 'Could not reset your password. Please request a new link.')
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Aurum" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white">Choose a new password</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          {done ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full gradient-brand flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-navy-900" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Password updated</h2>
              <p className="text-sm text-slate-500 mb-6">You can now sign in with your new password.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 rounded-lg gradient-brand text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green/40 ${errors.password ? 'border-red-400' : 'border-slate-200'}`}
                  {...register('password')}
                />
                {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
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
                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-navy-900 gradient-brand hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <LogoSpinner />
                    Updating…
                  </>
                ) : 'Update password'}
              </button>

              <p className="text-sm text-slate-500 text-center pt-2">
                <Link to="/forgot-password" className="font-medium text-navy-900 hover:underline">Request a new link</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
