import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCEs } from '../../api/compensationEvents'
import type { CompensationEvent } from '../../types'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

type Scenario = 'ACCEPTED' | 'PARTIAL' | 'REJECTED'

interface CEScenario {
  ce: CompensationEvent
  scenario: Scenario
  partialPct: number
}

const scenarioColors: Record<Scenario, string> = {
  ACCEPTED: '#16A34A',
  PARTIAL: '#D97706',
  REJECTED: '#DC2626',
}

export default function CEWhatIfPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: ces = [], isLoading } = useQuery({
    queryKey: ['ces', projectId],
    queryFn: () => getCEs(projectId!),
    enabled: !!projectId,
  })

  const activeCEs = ces.filter((ce) => ce.status !== 'CLOSED')
  const [scenarios, setScenarios] = useState<Record<string, CEScenario>>({})

  const getScenario = (ce: CompensationEvent): CEScenario =>
    scenarios[ce.id] ?? { ce, scenario: 'ACCEPTED', partialPct: 100 }

  const setScenarioFor = (ce: CompensationEvent, scenario: Scenario) => {
    setScenarios((prev) => ({ ...prev, [ce.id]: { ce, scenario, partialPct: prev[ce.id]?.partialPct ?? 100 } }))
  }

  const setPartialPct = (ce: CompensationEvent, pct: number) => {
    setScenarios((prev) => ({ ...prev, [ce.id]: { ...prev[ce.id], ce, scenario: 'PARTIAL', partialPct: pct } }))
  }

  const summary = useMemo(() => {
    const totalAssessed = activeCEs.reduce((s, ce) => s + (ce.valuationAmount ?? 0), 0)
    let totalWhatIf = 0
    let accepted = 0, partial = 0, rejected = 0

    activeCEs.forEach((ce) => {
      const s = getScenario(ce)
      const val = ce.valuationAmount ?? 0
      if (s.scenario === 'ACCEPTED') { totalWhatIf += val; accepted++ }
      else if (s.scenario === 'PARTIAL') { totalWhatIf += val * (s.partialPct / 100); partial++ }
      else { rejected++ }
    })

    return { totalAssessed, totalWhatIf, accepted, partial, rejected, variance: totalWhatIf - totalAssessed }
  }, [activeCEs, scenarios])

  const chartData = activeCEs.map((ce) => {
    const s = getScenario(ce)
    const assessed = ce.valuationAmount ?? 0
    let whatIf = 0
    if (s.scenario === 'ACCEPTED') whatIf = assessed
    else if (s.scenario === 'PARTIAL') whatIf = assessed * (s.partialPct / 100)
    return { name: ce.ceNumber, assessed, whatIf, scenario: s.scenario }
  })

  if (isLoading) return <div className="text-slate-400 py-12 text-center">Loading…</div>

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">CE What-If Analysis</h1>
        <p className="text-sm text-slate-500 mt-0.5">Model acceptance scenarios to forecast financial exposure</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Assessed', value: `£${summary.totalAssessed.toLocaleString('en-GB')}`, color: 'text-slate-700' },
          { label: 'What-If Total', value: `£${summary.totalWhatIf.toLocaleString('en-GB')}`, color: 'text-gold-600' },
          { label: 'Variance', value: `${summary.variance >= 0 ? '+' : ''}£${summary.variance.toLocaleString('en-GB')}`, color: summary.variance >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Accepted', value: summary.accepted, color: 'text-green-600' },
          { label: 'Partial', value: summary.partial, color: 'text-amber-600' },
          { label: 'Rejected', value: summary.rejected, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Assessed vs What-If by CE</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barGap={4}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => `£${v.toLocaleString('en-GB')}`} />
              <ReferenceLine y={0} stroke="#E2E8F0" />
              <Bar dataKey="assessed" name="Assessed" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="whatIf" name="What-If" radius={[3, 3, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={scenarioColors[entry.scenario as Scenario]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Scenario legend */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Scenario Impact</h3>
          <div className="space-y-3">
            {activeCEs.map((ce) => {
              const s = getScenario(ce)
              const val = ce.valuationAmount ?? 0
              let impact = 0
              if (s.scenario === 'ACCEPTED') impact = val
              else if (s.scenario === 'PARTIAL') impact = val * (s.partialPct / 100)
              return (
                <div key={ce.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs font-bold text-navy-900 w-16">{ce.ceNumber}</span>
                  <span className={`text-xs font-medium w-20 ${scenarioColors[s.scenario] === '#16A34A' ? 'text-green-600' : s.scenario === 'PARTIAL' ? 'text-amber-600' : 'text-red-600'}`}>
                    {s.scenario === 'ACCEPTED' ? '✓ Accepted' : s.scenario === 'PARTIAL' ? `~ ${s.partialPct}%` : '✗ Rejected'}
                  </span>
                  <span className="text-slate-500 text-xs">£{impact.toLocaleString('en-GB')}</span>
                  {s.scenario !== 'ACCEPTED' && <span className="text-xs text-red-500">-£{(val - impact).toLocaleString('en-GB')}</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* CE Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Set Scenarios</h3>
          <div className="flex gap-2 text-xs">
            <button onClick={() => activeCEs.forEach((ce) => setScenarioFor(ce, 'ACCEPTED'))} className="px-3 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium">All Accepted</button>
            <button onClick={() => activeCEs.forEach((ce) => setScenarioFor(ce, 'REJECTED'))} className="px-3 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-medium">All Rejected</button>
            <button onClick={() => setScenarios({})} className="px-3 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium">Reset</button>
          </div>
        </div>
        {activeCEs.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">No active compensation events.</p>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-24">CE No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-28">Assessed (£)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-64">Scenario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-28">What-If (£)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-24">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activeCEs.map((ce) => {
                const s = getScenario(ce)
                const val = ce.valuationAmount ?? 0
                const whatIf = s.scenario === 'ACCEPTED' ? val : s.scenario === 'PARTIAL' ? val * (s.partialPct / 100) : 0
                const impact = whatIf - val
                return (
                  <tr key={ce.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-navy-900">{ce.ceNumber}</span></td>
                    <td className="px-4 py-3 text-slate-700 font-medium text-xs">{ce.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-medium">{val ? `£${val.toLocaleString('en-GB')}` : 'TBD'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(['ACCEPTED', 'PARTIAL', 'REJECTED'] as Scenario[]).map((sc) => (
                          <button
                            key={sc}
                            onClick={() => setScenarioFor(ce, sc)}
                            className={`text-xs px-2 py-1 rounded-lg font-medium border transition-colors ${s.scenario === sc ? (sc === 'ACCEPTED' ? 'bg-green-600 text-white border-green-600' : sc === 'PARTIAL' ? 'bg-amber-500 text-white border-amber-500' : 'bg-red-600 text-white border-red-600') : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                          >
                            {sc === 'ACCEPTED' ? '✓' : sc === 'PARTIAL' ? '~' : '✗'} {sc.charAt(0) + sc.slice(1).toLowerCase()}
                          </button>
                        ))}
                        {s.scenario === 'PARTIAL' && (
                          <input
                            type="range" min="0" max="100" step="5"
                            value={s.partialPct}
                            onChange={(e) => setPartialPct(ce, Number(e.target.value))}
                            className="w-20 accent-amber-500"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gold-600">£{whatIf.toLocaleString('en-GB')}</td>
                    <td className="px-4 py-3">
                      {impact === 0 ? <span className="text-slate-400 text-xs">-</span> :
                        impact > 0 ? <span className="text-green-600 text-xs flex items-center gap-1"><TrendingUp className="w-3 h-3" />+£{impact.toLocaleString('en-GB')}</span> :
                        <span className="text-red-600 text-xs flex items-center gap-1"><TrendingDown className="w-3 h-3" />-£{Math.abs(impact).toLocaleString('en-GB')}</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
