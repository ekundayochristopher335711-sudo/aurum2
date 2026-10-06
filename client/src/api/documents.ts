import api from '../lib/axios'

export type DocumentCategory = 'GENERAL' | 'PHOTO' | 'DRAWING'

export interface ProjectDocument {
  id: string
  projectId: string
  ceId?: string | null
  ewId?: string | null
  category: DocumentCategory
  reference?: string | null
  name: string
  size: number
  mimeType: string
  uploadedBy: string
  uploadedByName: string
  createdAt: string
  ce?: { id: string; ceNumber: string; title: string } | null
  ew?: { id: string; ewNumber: string; title: string } | null
}

export const getProjectDocuments = (
  projectId: string,
  params?: { category?: DocumentCategory; ceId?: string; ewId?: string },
) => api.get<ProjectDocument[]>(`/projects/${projectId}/documents`, { params }).then((r) => r.data)

export const uploadProjectDocument = (
  projectId: string,
  file: File,
  opts?: { category?: DocumentCategory; ceId?: string; ewId?: string; reference?: string },
) => {
  const form = new FormData()
  form.append('file', file)
  if (opts?.category) form.append('category', opts.category)
  if (opts?.ceId) form.append('ceId', opts.ceId)
  if (opts?.ewId) form.append('ewId', opts.ewId)
  if (opts?.reference) form.append('reference', opts.reference)
  return api.post<ProjectDocument>(`/projects/${projectId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const deleteProjectDocument = (projectId: string, docId: string) =>
  api.delete(`/projects/${projectId}/documents/${docId}`)

export const downloadDocument = async (projectId: string, docId: string, fileName: string) => {
  const res = await api.get(`/projects/${projectId}/documents/${docId}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// Images are fetched as blobs (the endpoint needs an auth header, so a plain
// <img src> URL cannot be used) and turned into a local object URL.
export const fetchDocumentBlobUrl = async (projectId: string, docId: string): Promise<string> => {
  const res = await api.get(`/projects/${projectId}/documents/${docId}/download`, {
    params: { inline: '1' },
    responseType: 'blob',
  })
  return URL.createObjectURL(res.data)
}
