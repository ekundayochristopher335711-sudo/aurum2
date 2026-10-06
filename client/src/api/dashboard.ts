import api from '../lib/axios'
import type { DashboardData, AuditLog } from '../types'

export const getDashboard = (projectId: string) =>
  api.get<DashboardData>(`/projects/${projectId}/dashboard`).then((r) => r.data)

export const getAuditLog = (projectId: string, params?: { entityType?: string; page?: number; limit?: number }) =>
  api.get<{ logs: AuditLog[]; total: number; page: number; pages: number }>(
    `/projects/${projectId}/audit-log`,
    { params },
  ).then((r) => r.data)

export const downloadReport = async (projectId: string, type: 'risk-register' | 'ce-summary' | 'commercial' | 'dossier') => {
  const res = await api.get(`/projects/${projectId}/reports/${type}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${type}-${new Date().toISOString().split('T')[0]}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export const downloadExcel = async (projectId: string, type: 'risks' | 'ces') => {
  const res = await api.get(`/projects/${projectId}/exports/${type}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${type}-${new Date().toISOString().split('T')[0]}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export const downloadCSV = async (projectId: string, type: 'risks' | 'ces') => {
  const res = await api.get(`/projects/${projectId}/exports/${type}-csv`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${type}-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export const importRisksFromExcel = async (projectId: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/projects/${projectId}/imports/risks`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data as { imported: number; errors: string[] })
}
