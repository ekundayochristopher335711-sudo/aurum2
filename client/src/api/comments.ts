import api from '../lib/axios'

export type CommentTarget = 'PROJECT' | 'EARLY_WARNING' | 'RISK' | 'COMPENSATION_EVENT' | 'NOTICE'

export type CommentVisibility = 'EVERYONE' | 'MANAGERS_ONLY'

export interface Reaction {
  id: string
  emoji: string
  userId: string
  user: { id: string; name: string }
}

export interface Comment {
  id: string
  projectId: string
  targetType: CommentTarget
  targetId: string
  body: string
  authorId: string
  visibility: CommentVisibility
  createdAt: string
  author: { id: string; name: string; email: string }
  reactions: Reaction[]
}

export const getComments = (projectId: string, targetType: CommentTarget, targetId?: string) =>
  api.get<Comment[]>(`/projects/${projectId}/comments`, { params: { targetType, targetId } }).then((r) => r.data)

export const addComment = (
  projectId: string, targetType: CommentTarget, body: string,
  targetId?: string, visibility: CommentVisibility = 'EVERYONE',
) => api.post<Comment>(`/projects/${projectId}/comments`, { targetType, targetId, body, visibility }).then((r) => r.data)

export const toggleReaction = (projectId: string, commentId: string, emoji: string) =>
  api.post<Reaction[]>(`/projects/${projectId}/comments/${commentId}/reactions`, { emoji }).then((r) => r.data)

export const deleteComment = (projectId: string, id: string) =>
  api.delete(`/projects/${projectId}/comments/${id}`)
