import api from '../lib/axios'
import type { RiskItem, RiskStatus } from '../types'

// Write payload - form values converted to API types (null clears a value)
export interface RiskPayload {
  description?: string
  probability?: number
  costImpact?: number | null
  timeImpact?: number | null
  mitigation?: string
  owner?: string
  earlyWarningId?: string | null
  status?: RiskStatus
}

const base = (pid: string) => `/projects/${pid}/risks`

export const getRisks = (projectId: string, status?: string) =>
  api.get<RiskItem[]>(base(projectId), { params: status ? { status } : {} }).then((r) => r.data)

export const getRisk = (projectId: string, id: string) =>
  api.get<RiskItem>(`${base(projectId)}/${id}`).then((r) => r.data)

export const createRisk = (projectId: string, data: RiskPayload) =>
  api.post<RiskItem>(base(projectId), data).then((r) => r.data)

export const updateRisk = (projectId: string, id: string, data: RiskPayload) =>
  api.put<RiskItem>(`${base(projectId)}/${id}`, data).then((r) => r.data)

export const deleteRisk = (projectId: string, id: string) =>
  api.delete(`${base(projectId)}/${id}`)
