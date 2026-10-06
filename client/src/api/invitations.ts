import api from '../lib/axios'

export interface InvitationPreview {
  email: string
  role: string
  projectName: string
  contractType: string
}

export const sendInvitation = (projectId: string, email: string, role: string) =>
  api.post(`/projects/${projectId}/invitations`, { email, role }).then((r) => r.data)

export const getInvitations = (projectId: string) =>
  api.get(`/projects/${projectId}/invitations`).then((r) => r.data)

export const revokeInvitation = (projectId: string, id: string) =>
  api.delete(`/projects/${projectId}/invitations/${id}`)

export const getInvitationPreview = (token: string) =>
  api.get<InvitationPreview>(`/invitations/${token}`).then((r) => r.data)

export const acceptInvitation = (token: string, name: string, password: string) =>
  api.post(`/invitations/${token}/accept`, { name, password }).then((r) => r.data)
