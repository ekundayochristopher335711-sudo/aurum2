import type { RiskItem } from '../../types'

interface Props {
  risks: RiskItem[]
  onCellClick?: (probability: number, impact: number) => void
}

const IMPACT_LABELS = ['Very Low', 'Low', 'Medium', 'High', 'Very High']
const PROB_LABELS = ['Very Low', 'Low', 'Medium', 'High', 'Very High']

function getCellColor(prob: number, impact: number): string {
  const score = prob * impact
  if (score >= 20) return 'bg-red-600 border-red-700'
  if (score >= 12) return 'bg-orange-500 border-orange-600'
  if (score >= 6) return 'bg-yellow-400 border-yellow-500'
  if (score >= 3) return 'bg-lime-400 border-lime-500'
  return 'bg-green-400 border-green-500'
}

function getCellTextColor(prob: number, impact: number): string {
  const score = prob * impact
  return score >= 6 ? 'text-white' : 'text-slate-800'
}

export default function RiskHeatmap({ risks, onCellClick }: Props) {
  const getCell = (prob: number, impact: number) =>
    risks.filter((r) => r.probability === prob && Math.round((r.costImpact ?? 0) / 50000) + 1 === impact || r.probability === prob && impact === Math.min(5, Math.max(1, Math.ceil(((r.costImpact ?? 10000) / 200000) * 5))))

  // Group risks by probability and a derived impact score
  const getImpactScore = (r: RiskItem): number => {
    if (!r.costImpact) return 1
    if (r.costImpact >= 200000) return 5
    if (r.costImpact >= 100000) return 4
    if (r.costImpact >= 50000) return 3
    if (r.costImpact >= 10000) return 2
    return 1
  }

  const getRisksInCell = (prob: number, impact: number) =>
    risks.filter((r) => r.probability === prob && getImpactScore(r) === impact && r.status !== 'CLOSED')

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">Risk Heat Map</h3>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Low</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block" /> Medium</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" /> High</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-600 inline-block" /> Critical</span>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Y-axis label */}
        <div className="flex flex-col items-center justify-center w-6">
          <span className="text-xs text-slate-400 font-medium" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            IMPACT (cost)
          </span>
        </div>

        <div className="flex-1">
          {/* Grid - rows = impact (5→1), cols = probability (1→5) */}
          <div className="grid gap-1" style={{ gridTemplateColumns: '80px repeat(5, 1fr)' }}>
            {/* Header row */}
            <div />
            {PROB_LABELS.map((label, i) => (
              <div key={i} className="text-center text-xs font-medium text-slate-500 pb-1">{i + 1}</div>
            ))}

            {/* Data rows - impact from 5 down to 1 */}
            {[5, 4, 3, 2, 1].map((impact) => (
              <>
                <div key={`label-${impact}`} className="flex items-center justify-end pr-2 text-xs text-slate-500 font-medium">
                  {IMPACT_LABELS[impact - 1]}
                </div>
                {[1, 2, 3, 4, 5].map((prob) => {
                  const cellRisks = getRisksInCell(prob, impact)
                  return (
                    <div
                      key={`${prob}-${impact}`}
                      onClick={() => onCellClick?.(prob, impact)}
                      className={`relative h-16 rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer hover:opacity-90 transition-opacity ${getCellColor(prob, impact)} ${getCellTextColor(prob, impact)}`}
                    >
                      {cellRisks.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 justify-center px-1">
                          {cellRisks.slice(0, 4).map((r) => (
                            <span key={r.id} className={`text-xs font-bold leading-none ${getCellTextColor(prob, impact)}`}>
                              {r.riskId}
                            </span>
                          ))}
                          {cellRisks.length > 4 && (
                            <span className={`text-xs font-bold ${getCellTextColor(prob, impact)}`}>+{cellRisks.length - 4}</span>
                          )}
                        </div>
                      )}
                      <span className={`text-xs opacity-50 mt-0.5 ${getCellTextColor(prob, impact)}`}>{prob * impact}</span>
                    </div>
                  )
                })}
              </>
            ))}
          </div>

          {/* X-axis label */}
          <div className="text-center text-xs text-slate-400 font-medium mt-2">PROBABILITY →</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          Impact is derived from cost: &lt;£10k=1, £10k-50k=2, £50k-100k=3, £100k-200k=4, &gt;£200k=5. Closed risks are excluded.
        </p>
      </div>
    </div>
  )
}
