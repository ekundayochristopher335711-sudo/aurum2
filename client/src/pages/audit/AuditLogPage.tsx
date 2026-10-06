import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react'
import { getAuditLog } from '../../api/dashboard'
import { format, parseISO } from 'date-fns'
import Badge from '../../components/ui/Badge'

const entityColors: Record<string, 'danger' | 'gold' | 'info' | 'warning' | 'success' | 'default'> = {
  EarlyWarning: 'danger',
  RiskItem: 'warning',
  CompensationEvent: 'gold',
  Notice: 'info',
  Project: 'default',
  Document: 'success',
}

const actionColors: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'default'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  STATUS_CHANGE: 'warning',
  EXPORT: 'default',
}

const entityOptions = [
  { value: '', label: 'All Entity Types' },
  { value: 'EarlyWarning', label: 'Early Warnings' },
  { value: 'RiskItem', label: 'Risk Items' },
  { value: 'CompensationEvent', label: 'Compensation Events' },
  { value: 'Notice', label: 'Notices' },
  { value: 'Project', label: 'Projects' },
]

export default function AuditLogPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [entityFilter, setEntityFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', projectId, entityFilter, page],
    queryFn: () => getAuditLog(projectId!, { entityType: entityFilter || undefined, page, limit: 50 }),
    enabled: !!projectId,
  })

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Audit Trail</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data?.total ?? 0} entries - every action is recorded with timestamp and user
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={entityFilter}
            onChange={(e) => { setEntityFilter(e.target.value); setPage(1) }}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            {entityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
        {isLoading ? (
          <div className="divide-y divide-slate-50">
            {[1,2,3,4,5].map((i) => <div key={i} className="h-14 animate-pulse bg-slate-50 m-4 rounded" />)}
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No audit entries found.</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Entity Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {format(parseISO(log.createdAt), 'dd MMM yyyy, HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                          {log.user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-slate-700 font-medium">{log.user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={actionColors[log.action] || 'default'}>{log.action}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={entityColors[log.entityType] || 'default'}>{log.entityType}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {log.changes ? (
                        <div className="space-y-0.5">
                          {Object.entries(log.changes).map(([field, change]) => (
                            <div key={field}>
                              <span className="font-medium text-slate-700">{field}:</span>{' '}
                              <span className="text-red-500 line-through">{String((change as {old: unknown}).old ?? '-')}</span>{' '}
                              <span className="text-green-600">→ {String((change as {new: unknown}).new ?? '-')}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No field changes recorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(data.pages ?? 1) > 1 && (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-500">Page {data.page} of {data.pages} · {data.total} entries</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                    disabled={page === data.pages}
                    className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
