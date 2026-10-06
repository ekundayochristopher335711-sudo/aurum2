import api from '../lib/axios'

export interface ActionCE {
  id: string
  ceNumber: string
  title: string
  status: string
  dueDate: string | null
  projectId: string
  projectName: string
}

export interface ActionEW {
  id: string
  ewNumber: string
  title: string
  dateRaised: string
  dateRequired: string | null
  projectId: string
  projectName: string
}

export interface UnreadThread {
  projectId: string
  projectName: string
  targetType: string
  targetId: string
  count: number
  latest: string
}

export interface MyActions {
  overdueCEs: ActionCE[]
  dueSoonCEs: ActionCE[]
  myEarlyWarnings: ActionEW[]
  unread: UnreadThread[]
  totals: { overdue: number; dueSoon: number; earlyWarnings: number; unread: number }
}

export const getMyActions = () => api.get<MyActions>('/me/actions').then((r) => r.data)

export interface UnreadCount { targetType: string; targetId: string; count: number }

export const getUnreadCounts = (projectId: string) =>
  api.get<UnreadCount[]>(`/projects/${projectId}/comments/unread`).then((r) => r.data)

export const markThreadRead = (projectId: string, targetType: string, targetId?: string) =>
  api.post(`/projects/${projectId}/comments/read`, { targetType, targetId })
