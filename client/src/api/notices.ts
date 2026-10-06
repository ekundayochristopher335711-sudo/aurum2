import api from '../lib/axios'
import type { Notice } from '../types'

const base = (pid: string) => `/projects/${pid}/notices`

export const getNotices = (projectId: string, params?: { type?: string; ceId?: string }) =>
  api.get<Notice[]>(base(projectId), { params }).then((r) => r.data)

export interface NoticePayload {
  title: string
  content: string
  type: string
  issuedTo: string
  dateIssued: string
  dueDate?: string
  ceId?: string
}

export const createNotice = (projectId: string, data: NoticePayload) =>
  api.post<Notice>(base(projectId), data).then((r) => r.data)

export const deleteNotice = (projectId: string, id: string) =>
  api.delete(`${base(projectId)}/${id}`)

export const downloadNoticePDF = (projectId: string, id: string) =>
  api.get(`${base(projectId)}/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data)
