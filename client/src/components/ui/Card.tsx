export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 border-b border-slate-100 ${className}`}>{children}</div>
}

export function CardBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>
}

export function KPICard({
  label,
  value,
  sub,
  color = 'gold',
  icon,
}: {
  label: string
  value: string | number
  sub?: string
  color?: 'gold' | 'red' | 'green' | 'blue' | 'slate'
  icon?: React.ReactNode
}) {
  const colors = {
    gold: 'text-gold-600',
    red: 'text-red-500',
    green: 'text-green-600',
    blue: 'text-blue-600',
    slate: 'text-slate-600',
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 hover:shadow-card-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 leading-snug">{label}</p>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <p className={`text-2xl font-semibold tracking-tight ${colors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}
