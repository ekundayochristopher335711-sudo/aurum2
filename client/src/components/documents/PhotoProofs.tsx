import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Trash2, X, Download } from 'lucide-react'
import {
  getProjectDocuments, uploadProjectDocument, deleteProjectDocument,
  fetchDocumentBlobUrl, downloadDocument, ProjectDocument,
} from '../../api/documents'
import { useProjectRole } from '../../hooks/useProjectRole'
import { useToast } from '../ui/Toast'
import { format, parseISO } from 'date-fns'

// Loads one image through the authenticated endpoint and renders it
function Thumb({ doc, onOpen }: { doc: ProjectDocument; onOpen: (url: string) => void }) {
  const { projectId } = useParams<{ projectId: string }>()
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let revoked: string | undefined
    let cancelled = false
    fetchDocumentBlobUrl(projectId!, doc.id)
      .then((u) => { if (cancelled) { URL.revokeObjectURL(u) } else { revoked = u; setUrl(u) } })
      .catch(() => {})
    return () => { cancelled = true; if (revoked) URL.revokeObjectURL(revoked) }
  }, [projectId, doc.id])

  if (!url) return <div className="w-full aspect-square rounded-lg bg-slate-100 animate-pulse" />
  return (
    <img
      src={url}
      alt={doc.name}
      onClick={() => onOpen(url)}
      className="w-full aspect-square object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity"
    />
  )
}

interface Props {
  ceId?: string
  ewId?: string
}

export default function PhotoProofs({ ceId, ewId }: Props) {
  const { projectId } = useParams<{ projectId: string }>()
  const { canEdit } = useProjectRole()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [lightbox, setLightbox] = useState<string | null>(null)

  const key = ['photos', projectId, ceId ?? ewId]
  const { data: photos = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getProjectDocuments(projectId!, { category: 'PHOTO', ceId, ewId }),
    enabled: !!projectId,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProjectDocument(projectId!, file, { category: 'PHOTO', ceId, ewId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      toast.success('Photo added as evidence')
    },
    onError: () => toast.error('Upload failed - images only, up to 15MB.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProjectDocument(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      toast.success('Photo removed')
    },
    onError: () => toast.error('Could not remove the photo.'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Photo Evidence</h3>
          {photos.length > 0 && <span className="text-xs text-slate-400">{photos.length}</span>}
        </div>
        {canEdit && (
          <label className="text-xs font-medium text-navy-900 hover:underline cursor-pointer">
            + Add photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadMutation.mutate(f)
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((i) => <div key={i} className="aspect-square rounded-lg bg-slate-100 animate-pulse" />)}</div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-slate-400">
          No photos yet. {canEdit && 'Site photos attached here become part of the contractual record.'}
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative">
              <Thumb doc={p} onOpen={setLightbox} />
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => downloadDocument(projectId!, p.id, p.name)}
                  title="Download"
                  className="p-1 rounded bg-white/90 text-slate-600 hover:text-navy-900 shadow-sm"
                >
                  <Download className="w-3 h-3" />
                </button>
                {canEdit && (
                  <button
                    onClick={() => deleteMutation.mutate(p.id)}
                    title="Remove"
                    className="p-1 rounded bg-white/90 text-slate-600 hover:text-red-600 shadow-sm"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 truncate" title={p.name}>
                {format(parseISO(p.createdAt), 'dd MMM')} · {p.uploadedByName}
              </p>
            </div>
          ))}
        </div>
      )}

      {uploadMutation.isPending && <p className="text-xs text-slate-400 mt-2">Uploading…</p>}

      {lightbox && (
        <div className="fixed inset-0 z-[95] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  )
}
