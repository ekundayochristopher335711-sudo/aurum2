import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { register as registerUser } from '../../api/auth'
import LogoSpinner from '../../components/ui/LogoSpinner'

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setServerError('')
      await registerUser({ name: data.name, email: data.email, password: data.password })
      setPending(true)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setServerError(status === 409 ? 'That email is already registered. Try signing in instead.' : 'Could not create your account. Please try again.')
    }
  }

  if (pending) return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full gradient-brand flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-7 h-7 text-navy-900" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Account created - pending approval</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          For security, an administrator reviews every new account. You'll be able to sign in as soon as yours is approved.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="w-full py-2.5 rounded-lg gradient-brand text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Back to Sign In
        </button>
      </div>
    </div>
  )

  const inputClass = (hasError: boolean) =>
    `w-full px-3.5 py-2.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green ${hasError ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Aurum" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white">Create your account</h1>
          <p className="text-slate-400 text-sm mt-2">Start managing NEC contracts with Aurum</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
              <input type="text" placeholder="John Smith" className={inputClass(!!errors.name)} {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
              <input type="email" placeholder="you@company.com" className={inputClass(!!errors.email)} {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  className={`${inputClass(!!errors.password)} pr-10`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
              <input type="password" placeholder="Repeat password" className={inputClass(!!errors.confirmPassword)} {...register('confirmPassword')} />
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
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-navy-900 gradient-brand hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed shadow-sm mt-2 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <LogoSpinner />
                  Creating account…
                </>
              ) : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500 text-center">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-navy-900 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
