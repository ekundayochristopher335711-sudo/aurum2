import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Download, Trash2, PencilRuler } from 'lucide-react'
import {
  getProjectDocuments, uploadProjectDocument, deleteProjectDocument,
  downloadDocument, ProjectDocument,
} from '../../api/documents'
import { useProjectRole } from '../../hooks/useProjectRole'
import { useToast } from '../../components/ui/Toast'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { format, parseISO } from 'date-fns'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DrawingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { canEdit } = useProjectRole()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [reference, setReference] = useState('')
  const [deleting, setDeleting] = useState<ProjectDocument | null>(null)

  const { data: drawings = [], isLoading } = useQuery({
    queryKey: ['drawings', projectId],
    queryFn: () => getProjectDocuments(projectId!, { category: 'DRAWING' }),
    enabled: !!projectId,
  })

  const closeUpload = () => { setUploadOpen(false); setFile(null); setReference('') }

  const uploadMutation = useMutation({
    mutationFn: () => uploadProjectDocument(projectId!, file!, { category: 'DRAWING', reference }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawings', projectId] })
      toast.success('Drawing added to the register')
      closeUpload()
    },
    onError: () => toast.error('Upload failed. Files must be under 15MB.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProjectDocument(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawings', projectId] })
      toast.success('Drawing removed')
      setDeleting(null)
    },
    onError: () => { toast.error('Could not remove the drawing.'); setDeleting(null) },
  })

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Drawings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {drawings.length} drawing{drawings.length !== 1 ? 's' : ''} on register · every download is audited
          </p>
        </div>
        {canEdit && (
          <Button icon={<Upload className="w-4 h-4" />} onClick={() => setUploadOpen(true)}>Upload Drawing</Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : drawings.length === 0 ? (
        <EmptyState
          title="No drawings yet"
          description="Upload architectural and engineering drawings here. Each one keeps its drawing number and revision, and every download is recorded."
          action={canEdit ? <Button icon={<Upload className="w-4 h-4" />} onClick={() => setUploadOpen(true)}>Upload Drawing</Button> : undefined}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Drawing No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">File</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Size</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {drawings.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded">
                      {d.reference || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gold-50 flex items-center justify-center shrink-0">
                        <PencilRuler className="w-4 h-4 text-gold-600" />
                      </div>
                      <p className="font-medium text-slate-800 truncate max-w-sm">{d.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{d.uploadedByName}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{format(parseISO(d.createdAt), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatSize(d.size)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => downloadDocument(projectId!, d.id, d.name)}
                        title="Download"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => setDeleting(d)}
                          title="Remove"
                          className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={uploadOpen} onClose={closeUpload} title="Upload Drawing" size="sm">
        <div className="space-y-4">
          <Input
            label="Drawing Number / Revision"
            placeholder="e.g. A-101 Rev C"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Drawing file</label>
            <input
              type="file"
              accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.tif,.tiff"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gold-50 file:text-gold-700 hover:file:bg-gold-100"
            />
            <p className="text-xs text-slate-400 mt-1.5">PDF, DWG, DXF or image - up to 15MB.</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={closeUpload}>Cancel</Button>
            <Button loading={uploadMutation.isPending} disabled={!file} onClick={() => uploadMutation.mutate()}>
              Upload
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        requirePassword
        open={!!deleting}
        title={`Remove ${deleting?.reference || deleting?.name}?`}
        message="The drawing will be removed from the register. This action is recorded in the audit trail."
        confirmLabel="Remove"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
