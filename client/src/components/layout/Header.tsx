import { useNavigate } from 'react-router-dom'
import { LogOut, Menu } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const roleLabelMap: Record<string, string> = {
  ADMIN: 'Admin',
  COMMERCIAL_MANAGER: 'Commercial Manager',
  VIEWER: 'Viewer',
}

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 shrink-0 gap-3">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1 lg:hidden flex items-center gap-0">
        <img src="/logo.png" alt="Aurum" className="w-10 h-10" />
        <span className="text-base font-display font-bold tracking-wide text-navy-900">AURUM</span>
      </div>

      <div className="hidden lg:block flex-1" />

      {user && (
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-800 leading-none">{user.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{roleLabelMap[user.role] ?? user.role}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-green to-brand-yellow flex items-center justify-center text-navy-900 font-bold text-sm shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            title="Sign out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  )
}
