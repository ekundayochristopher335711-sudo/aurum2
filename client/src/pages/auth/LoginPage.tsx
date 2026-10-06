import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ArrowRight, Shield, Lock, User } from 'lucide-react'
import { login } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import LogoSpinner from '../../components/ui/LogoSpinner'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})
type FormData = z.infer<typeof schema>

const featureItems = [
  { label: 'Early Warnings', desc: 'NEC cl. 15', icon: Shield },
  { label: 'Risk Register', desc: 'Live exposure', icon: Lock },
  { label: 'Comp. Events', desc: 'Full workflow', icon: User },
  { label: 'Audit Trail', desc: 'Every action', icon: ArrowRight },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setServerError('')
      const res = await login(data.email, data.password)
      setAuth(res.user, res.token)
      navigate('/home')
    } catch (e: unknown) {
      const resp = (e as { response?: { status?: number; data?: { message?: string } } })?.response
      // 403 = right password but account pending approval / deactivated - explain why
      setServerError(resp?.status === 403 && resp.data?.message ? resp.data.message : 'Invalid email or password. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-5/12 flex-col justify-between p-12 relative overflow-hidden bg-navy-900">

        {/* Top branding section */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-2">
            <img src="/logo.png" alt="Aurum" className="w-12 h-12" />
            <div>
              <p className="text-white font-display font-bold text-2xl leading-none tracking-[0.2em]">AURUM</p>
              <p className="text-brand-yellow font-display text-xs font-medium mt-1 tracking-[0.3em] uppercase">Project Controls</p>
            </div>
          </div>
        </div>

        {/* Main headline */}
        <div className="relative z-10 mb-12">
          <h1 className="text-4xl font-bold text-white leading-tight mb-6">
            NEC Contract<br />
            <span className="text-brand-yellow">Intelligence Engine</span>
          </h1>
          
          <p className="text-slate-300 text-lg leading-relaxed max-w-md mb-10">
            Digitise Early Warnings, Risk Registers, Compensation Events and commercial reporting - built exclusively for NEC3 and NEC4 contracts.
          </p>

          {/* Enhanced feature grid with icons */}
          <div className="grid grid-cols-2 gap-4">
            {featureItems.map(({ label, desc, icon: Icon }) => (
              <div 
                key={label} 
                className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all duration-300 hover:border-white/20"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-brand-yellow group-hover:text-white transition-colors" />
                  </div>
                  <p className="text-white text-sm font-medium group-hover:text-white transition-colors">{label}</p>
                </div>
                <p className="text-slate-400 text-xs group-hover:text-slate-300 transition-colors">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Professional footer with security badge */}
        <div className="relative z-10 flex items-center justify-between pt-8 border-t border-white/5">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Shield className="w-4 h-4 text-slate-500" />
            <span>Enterprise-grade security</span>
          </div>
          <div className="text-xs text-slate-500">
            © 2024 Aurum Project Controls
          </div>
        </div>
      </div>

      {/* Enhanced right panel - refined form card */}
      <div className="flex w-full lg:w-7/12 items-center justify-center p-8 bg-surface-50 relative">
        <div className="relative bg-white rounded-2xl shadow-card-lg p-8 sm:p-10 w-full max-w-md border border-slate-100/60">
          {/* Welcome header */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-navy-900 flex items-center justify-center mx-auto mb-6 shadow-lg">
              <img src="/logo.png" alt="Aurum" className="w-8 h-8 object-contain brightness-0 invert" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Sign in to your account to continue to Aurum Project Controls
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email address
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                className={`w-full px-4 py-3 text-sm rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green ${
                  errors.email
                    ? 'border-red-400 bg-red-50 placeholder-red-300'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                  <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 pr-12 text-sm rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green ${
                    errors.password
                      ? 'border-red-400 bg-red-50 placeholder-red-300'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                  <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                  {errors.password.message}
                </p>
              )}
              <div className="mt-4 text-right">
                <Link
                  to="/forgot-password"
                  className="text-xs text-slate-500 hover:text-navy-800 transition-colors font-medium hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Server error */}
            {serverError && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <p className="text-sm text-red-600 flex items-start gap-2">
                  <span className="w-1 h-1 bg-red-500 rounded-full mt-1.5 flex-shrink-0"></span>
                  <span>{serverError}</span>
                </p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-navy-900 gradient-brand hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2 group"
            >
              {isSubmitting ? (
                <>
                  <LogoSpinner />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Register link */}
          <p className="mt-8 text-sm text-slate-500 text-center">
            New to Aurum?{' '}
            <Link
              to="/register"
              className="font-medium text-navy-800 hover:text-brand-yellow transition-colors hover:underline"
            >
              Create an account
            </Link>
          </p>

          {/* Footer security badge */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <Shield className="w-3 h-3" />
              Protected by enterprise-grade security
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
