import { NavLink, useParams } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, AlertTriangle, ShieldAlert, Briefcase,
  FileText, Bell, ClipboardList, GitBranch, Files, Users, Home, PencilRuler,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

function NavItem({ to, icon: Icon, label, end = false, onClose }: { to: string; icon: React.ElementType; label: string; end?: boolean; onClose?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg mx-3 transition-all ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand-green' : ''}`} />
          <span>{label}</span>
          {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-green" />}
        </>
      )}
    </NavLink>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-6 pt-5 pb-1 text-xs font-semibold text-slate-600 uppercase tracking-widest">
      {children}
    </p>
  )
}

function ProjectNav({ projectId }: { projectId: string }) {
  const base = `/projects/${projectId}`
  const items = [
    { to: base, icon: Home, label: 'Overview & Team', end: true },
    { to: `${base}/dashboard`, icon: LayoutDashboard, label: 'Dashboard' },
    { to: `${base}/early-warnings`, icon: AlertTriangle, label: 'Early Warnings' },
    { to: `${base}/risks`, icon: ShieldAlert, label: 'Risk Register' },
    { to: `${base}/compensation-events`, icon: FileText, label: 'Comp. Events' },
    { to: `${base}/notices`, icon: Bell, label: 'Notices' },
    { to: `${base}/documents`, icon: Files, label: 'Documents' },
    { to: `${base}/drawings`, icon: PencilRuler, label: 'Drawings' },
    { to: `${base}/ce-whatif`, icon: GitBranch, label: 'CE What-If' },
    { to: `${base}/audit`, icon: ClipboardList, label: 'Audit Trail' },
  ]
  return (
    <>
      <SectionLabel>Project</SectionLabel>
      {items.map((item) => <NavItem key={item.to} {...item} />)}
    </>
  )
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { projectId } = useParams()
  const user = useAuthStore((s) => s.user)

  return (
    <div className="w-64 lg:w-56 h-full bg-navy-900 flex flex-col shrink-0 border-r border-white/5">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-0">
          <img src="/logo-light.png" alt="Aurum" className="w-10 h-10 shrink-0" />
          <div className="min-w-0">
            <p className="text-white font-display font-bold text-base leading-none tracking-wide">AURUM</p>
            <p className="text-slate-400 font-display text-[10px] mt-1 truncate tracking-[0.18em] uppercase">Project Controls</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
        <SectionLabel>Main</SectionLabel>
        <NavItem to="/home" icon={LayoutDashboard} label="My Actions" />
        <NavItem to="/projects" icon={FolderOpen} label="Projects" end />
        <NavItem to="/jobs" icon={Briefcase} label="Aurum Jobs" />
        {user?.role === 'ADMIN' && <NavItem to="/admin/users" icon={Users} label="User Management" />}
        <NavItem to="/settings/notifications" icon={Bell} label="Settings" />
        {projectId && <ProjectNav projectId={projectId} />}
      </nav>

      {/* Bottom tag */}
      <div className="px-5 py-4 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
          <span className="text-xs text-slate-500">Layer 1 · Layer 2 · Layer 3</span>
        </div>
      </div>
    </div>
  )
}
