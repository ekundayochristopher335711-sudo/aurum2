import api from '../lib/axios'
import type { EarlyWarning } from '../types'

const base = (pid: string) => `/projects/${pid}/early-warnings`

export const getEarlyWarnings = (projectId: string, status?: string) =>
  api.get<EarlyWarning[]>(base(projectId), { params: status ? { status } : {} }).then((r) => r.data)

export const getEarlyWarning = (projectId: string, id: string) =>
  api.get<EarlyWarning>(`${base(projectId)}/${id}`).then((r) => r.data)

export const createEarlyWarning = (projectId: string, data: Partial<EarlyWarning>) =>
  api.post<EarlyWarning>(base(projectId), data).then((r) => r.data)

export const updateEarlyWarning = (projectId: string, id: string, data: Partial<EarlyWarning>) =>
  api.put<EarlyWarning>(`${base(projectId)}/${id}`, data).then((r) => r.data)

export const deleteEarlyWarning = (projectId: string, id: string) =>
  api.delete(`${base(projectId)}/${id}`)

export const downloadEarlyWarningPDF = async (projectId: string, id: string, ewNumber: string) => {
  const res = await api.get(`${base(projectId)}/${id}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${ewNumber}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
