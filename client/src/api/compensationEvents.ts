import api from '../lib/axios'
import type { CompensationEvent, CEStatus } from '../types'

// Write payload - form values converted to API types (null clears a value)
export interface CEPayload {
  title?: string
  description?: string
  clauseRef?: string
  dateAwareness?: string | null
  dateNotified?: string
  dateResponseDue?: string | null
  valuationAmount?: number | null
  status?: CEStatus
}

const base = (pid: string) => `/projects/${pid}/compensation-events`

export const getCEs = (projectId: string, status?: string) =>
  api.get<CompensationEvent[]>(base(projectId), { params: status ? { status } : {} }).then((r) => r.data)

export const getCE = (projectId: string, id: string) =>
  api.get<CompensationEvent>(`${base(projectId)}/${id}`).then((r) => r.data)

export const createCE = (projectId: string, data: CEPayload) =>
  api.post<CompensationEvent>(base(projectId), data).then((r) => r.data)

export const updateCE = (projectId: string, id: string, data: CEPayload) =>
  api.put<CompensationEvent>(`${base(projectId)}/${id}`, data).then((r) => r.data)

export const deleteCE = (projectId: string, id: string) =>
  api.delete(`${base(projectId)}/${id}`)

export const uploadDocument = (projectId: string, ceId: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`${base(projectId)}/${ceId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}
