import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { forgotPassword } from '../../api/auth'
import LogoSpinner from '../../components/ui/LogoSpinner'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setServerError('')
      await forgotPassword(data.email)
      setSent(true)
    } catch {
      setServerError('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Aurum" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white">Reset your password</h1>
          <p className="text-slate-400 text-sm mt-2">We'll email you a secure reset link</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full gradient-brand flex items-center justify-center mx-auto mb-4">
                <MailCheck className="w-7 h-7 text-navy-900" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-slate-500 mb-6">
                If that email is registered, a reset link is on its way. The link expires in 1 hour.
              </p>
              <Link to="/login" className="text-sm font-medium text-navy-900 hover:underline">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green ${errors.email ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  {...register('email')}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
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
                    Sending…
                  </>
                ) : 'Send reset link'}
              </button>

              <p className="text-sm text-slate-500 text-center pt-2">
                Remembered it?{' '}
                <Link to="/login" className="font-medium text-navy-900 hover:underline">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
