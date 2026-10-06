import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, Clock, AlertTriangle, MessageSquare, CheckCircle2, ArrowRight } from 'lucide-react'
import { getMyActions, ActionCE } from '../../api/myActions'
import { useAuthStore } from '../../store/authStore'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'

const targetPath: Record<string, string> = {
  PROJECT: '',
  EARLY_WARNING: 'early-warnings',
  RISK: 'risks',
  COMPENSATION_EVENT: 'compensation-events',
  NOTICE: 'notices',
}

function CERow({ ce, overdue, onOpen }: { ce: ActionCE; overdue?: boolean; onOpen: () => void }) {
  const days = ce.dueDate ? differenceInCalendarDays(parseISO(ce.dueDate), new Date()) : null
  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3 group"
    >
      <span className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded shrink-0">{ce.ceNumber}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-800 truncate">{ce.title}</span>
        <span className="block text-xs text-slate-400 truncate">{ce.projectName}</span>
      </span>
      {days !== null && (
        <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${overdue ? 'bg-red-50 text-red-600' : days <= 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
          {overdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
        </span>
      )}
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
    </button>
  )
}

function Section({
  icon: Icon, title, count, tone, children,
}: {
  icon: React.ElementType; title: string; count: number
  tone: 'red' | 'amber' | 'slate' | 'blue'; children: React.ReactNode
}) {
  const tones = {
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-600',
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <span className="text-xs text-slate-400">{count}</span>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  )
}

export default function MyActionsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery({
    queryKey: ['my-actions'],
    queryFn: getMyActions,
    refetchInterval: 60000,
  })

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const nothingToDo = data && data.totals.overdue === 0 && data.totals.dueSoon === 0
    && data.totals.earlyWarnings === 0 && data.totals.unread === 0

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Good day, {firstName}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {isLoading ? 'Checking what needs you…' : nothingToDo ? 'Nothing needs your attention right now.' : 'Here is what needs your attention across your projects.'}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : nothingToDo ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card px-6 py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <h2 className="text-sm font-semibold text-slate-700">You are all caught up</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            No overdue deadlines, nothing due this week, and no unread discussion.
          </p>
          <button
            onClick={() => navigate('/projects')}
            className="mt-5 text-sm font-medium text-navy-900 hover:underline"
          >
            Go to projects →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {data!.overdueCEs.length > 0 && (
            <Section icon={AlertOctagon} title="Overdue - action required" count={data!.overdueCEs.length} tone="red">
              {data!.overdueCEs.map((ce) => (
                <CERow key={ce.id} ce={ce} overdue onOpen={() => navigate(`/projects/${ce.projectId}/compensation-events`)} />
              ))}
            </Section>
          )}

          {data!.dueSoonCEs.length > 0 && (
            <Section icon={Clock} title="Due within 7 days" count={data!.dueSoonCEs.length} tone="amber">
              {data!.dueSoonCEs.map((ce) => (
                <CERow key={ce.id} ce={ce} onOpen={() => navigate(`/projects/${ce.projectId}/compensation-events`)} />
              ))}
            </Section>
          )}

          {data!.myEarlyWarnings.length > 0 && (
            <Section icon={AlertTriangle} title="Your open early warnings" count={data!.myEarlyWarnings.length} tone="slate">
              {data!.myEarlyWarnings.map((ew) => (
                <button
                  key={ew.id}
                  onClick={() => navigate(`/projects/${ew.projectId}/early-warnings`)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3 group"
                >
                  <span className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded shrink-0">{ew.ewNumber}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-800 truncate">{ew.title}</span>
                    <span className="block text-xs text-slate-400 truncate">{ew.projectName}</span>
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{format(parseISO(ew.dateRaised), 'dd MMM')}</span>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </button>
              ))}
            </Section>
          )}

          {data!.unread.length > 0 && (
            <Section icon={MessageSquare} title="Unread discussion" count={data!.totals.unread} tone="blue">
              {data!.unread.map((u) => (
                <button
                  key={`${u.targetType}:${u.targetId}`}
                  onClick={() => navigate(`/projects/${u.projectId}/${targetPath[u.targetType] ?? ''}`)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3 group"
                >
                  <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {u.count}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-800 truncate">
                      {u.count} new comment{u.count !== 1 ? 's' : ''} on {u.targetType.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <span className="block text-xs text-slate-400 truncate">{u.projectName}</span>
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{format(parseISO(u.latest), 'dd MMM, HH:mm')}</span>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </button>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
