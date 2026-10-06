import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Download, FileText } from 'lucide-react'
import { getProjectDocuments, downloadDocument, ProjectDocument } from '../../api/documents'
import EmptyState from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { format, parseISO } from 'date-fns'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => getProjectDocuments(projectId!),
    enabled: !!projectId,
  })

  const toast = useToast()
  const downloadMutation = useMutation({
    mutationFn: (doc: ProjectDocument) => downloadDocument(projectId!, doc.id, doc.name),
    onError: () => toast.error('Download failed - the file may no longer be in storage.'),
  })

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Document Register</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {docs.length} document{docs.length !== 1 ? 's' : ''} on record · every download is audited
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Documents attached to Compensation Events appear here as the project's central register."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Document</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Linked CE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Size</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-navy-900" />
                      </div>
                      <p className="font-medium text-slate-800 truncate max-w-sm">{doc.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {doc.ce ? (
                      <button
                        onClick={() => navigate(`/projects/${projectId}/compensation-events`)}
                        className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded hover:bg-navy-100 transition-colors"
                        title={doc.ce.title}
                      >
                        {doc.ce.ceNumber}
                      </button>
                    ) : doc.ew ? (
                      <button
                        onClick={() => navigate(`/projects/${projectId}/early-warnings`)}
                        className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded hover:bg-navy-100 transition-colors"
                        title={doc.ew.title}
                      >
                        {doc.ew.ewNumber}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{doc.category === 'DRAWING' ? (doc.reference || 'Drawing') : 'Project'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{doc.uploadedByName}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{format(parseISO(doc.createdAt), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatSize(doc.size)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => downloadMutation.mutate(doc)}
                      title="Download"
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
