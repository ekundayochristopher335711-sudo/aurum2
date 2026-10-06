import Badge from './Badge'
import type { EWStatus, RiskStatus, CEStatus } from '../../types'

type AnyStatus = EWStatus | RiskStatus | CEStatus

const statusConfig: Record<AnyStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' | 'gold' }> = {
  OPEN: { label: 'Open', variant: 'danger' },
  MITIGATED: { label: 'Mitigated', variant: 'warning' },
  CLOSED: { label: 'Closed', variant: 'success' },
  NOTIFIED: { label: 'Notified', variant: 'info' },
  QUOTED: { label: 'Quoted', variant: 'gold' },
  ASSESSED: { label: 'Assessed', variant: 'warning' },
  IMPLEMENTED: { label: 'Implemented', variant: 'success' },
}

export default function StatusBadge({ status }: { status: AnyStatus }) {
  const config = statusConfig[status] ?? { label: status, variant: 'default' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
