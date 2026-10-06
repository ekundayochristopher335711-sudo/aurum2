import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, FileDown, MessageSquare } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getEarlyWarnings, createEarlyWarning, updateEarlyWarning, deleteEarlyWarning, downloadEarlyWarningPDF } from '../../api/earlyWarnings'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import CommentThread from '../../components/comments/CommentThread'
import PhotoProofs from '../../components/documents/PhotoProofs'
import { getUnreadCounts } from '../../api/myActions'
import type { EarlyWarning, EWStatus } from '../../types'
import { useProjectRole } from '../../hooks/useProjectRole'
import { format, parseISO } from 'date-fns'

const schema = z.object({
  title: z.string().min(1, 'Title required'),
  description: z.string().min(1, 'Description required'),
  dateRaised: z.string().min(1, 'Date required'),
  assignedTo: z.string().optional(),
  dateRequired: z.string().optional(),
  status: z.enum(['OPEN', 'MITIGATED', 'CLOSED']).optional(),
})
type FormData = z.infer<typeof schema>

const statusOptions = [
  { value: 'OPEN', label: 'Open' },
  { value: 'MITIGATED', label: 'Mitigated' },
  { value: 'CLOSED', label: 'Closed' },
]
const filterOptions = [{ value: '', label: 'All Statuses' }, ...statusOptions]

export default function EarlyWarningsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const { canEdit } = useProjectRole()
  const toast = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EarlyWarning | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<EarlyWarning | null>(null)
  const [discussing, setDiscussing] = useState<EarlyWarning | null>(null)

  const { data: unreadCounts = [] } = useQuery({
    queryKey: ['unread', projectId],
    queryFn: () => getUnreadCounts(projectId!),
    enabled: !!projectId,
  })
  const unreadFor = (id: string) =>
    unreadCounts.find((u) => u.targetType === 'EARLY_WARNING' && u.targetId === id)?.count ?? 0

  const { data: ews = [], isLoading } = useQuery({
    queryKey: ['early-warnings', projectId, statusFilter],
    queryFn: () => getEarlyWarnings(projectId!, statusFilter || undefined),
    enabled: !!projectId,
  })

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { dateRaised: new Date().toISOString().split('T')[0] },
  })

  const openEdit = (ew: EarlyWarning) => {
    setEditing(ew)
    setValue('title', ew.title)
    setValue('description', ew.description)
    setValue('dateRaised', ew.dateRaised.split('T')[0])
    setValue('assignedTo', ew.assignedTo || '')
    setValue('dateRequired', ew.dateRequired ? ew.dateRequired.split('T')[0] : '')
    setValue('status', ew.status)
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null); reset({ dateRaised: new Date().toISOString().split('T')[0] }) }

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      editing
        ? updateEarlyWarning(projectId!, editing.id, data)
        : createEarlyWarning(projectId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-warnings', projectId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      toast.success(editing ? 'Early warning updated' : 'Early warning logged')
      closeModal()
    },
    onError: () => toast.error('Could not save the early warning. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEarlyWarning(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-warnings', projectId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      toast.success(`${deleting?.ewNumber ?? 'EW'} deleted`)
      setDeleting(null)
    },
    onError: () => { toast.error('Delete failed - only project admins can delete records.'); setDeleting(null) },
  })

  // Client-side search keeps it instant on a busy register
  const q = search.trim().toLowerCase()
  const visibleEWs = q
    ? ews.filter((ew) =>
        ew.ewNumber.toLowerCase().includes(q) ||
        ew.title.toLowerCase().includes(q) ||
        ew.description.toLowerCase().includes(q) ||
        (ew.assignedTo ?? '').toLowerCase().includes(q))
    : ews

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Early Warnings</h1>
          <p className="text-sm text-slate-500 mt-0.5">{ews.length} item{ews.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search early warnings…"
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 w-48 focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            {filterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {canEdit && (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setModalOpen(true) }}>
              New Early Warning
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : ews.length === 0 ? (
        <EmptyState
          title="No early warnings"
          description="Log the first early warning under NEC clause 15.1"
          action={canEdit ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>New Early Warning</Button> : undefined}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">EW No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Date Raised</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Date Required</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Risks</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleEWs.map((ew) => (
                <tr key={ew.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded">{ew.ewNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{ew.title}</p>
                    <p className="text-xs text-slate-400 truncate max-w-xs">{ew.description}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{format(parseISO(ew.dateRaised), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{ew.dateRequired ? format(parseISO(ew.dateRequired), 'dd MMM yyyy') : '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status={ew.status} /></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{ew.riskItems?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDiscussing(ew)} title="Comments & photos" className="relative p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                        <MessageSquare className="w-4 h-4" />
                        {unreadFor(ew.id) > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                            {unreadFor(ew.id)}
                          </span>
                        )}
                      </button>
                      <button onClick={() => downloadEarlyWarningPDF(projectId!, ew.id, ew.ewNumber).then(() => toast.success('Notice PDF downloaded')).catch(() => toast.error('PDF download failed'))} title="Download formal notice PDF" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><FileDown className="w-4 h-4" /></button>
                      {canEdit && (
                        <>
                          <button onClick={() => openEdit(ew)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => setDeleting(ew)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!discussing} onClose={() => setDiscussing(null)} title={discussing ? `${discussing.ewNumber} - ${discussing.title}` : ''} size="lg">
        {discussing && (
          <div className="space-y-6">
            <PhotoProofs ewId={discussing.id} />
            <div className="border-t border-slate-100 pt-5">
              <CommentThread targetType="EARLY_WARNING" targetId={discussing.id} compact />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        requirePassword
        open={!!deleting}
        title={`Delete ${deleting?.ewNumber}?`}
        message={`"${deleting?.title}" will be permanently removed. This action is recorded in the audit trail.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />

      <Modal open={modalOpen} onClose={closeModal} title={editing ? `Edit ${editing.ewNumber}` : 'New Early Warning'} size="lg">
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <Input label="Title *" placeholder="e.g. Ground contamination risk at zone 4" error={errors.title?.message} {...register('title')} />
          <Textarea label="Description *" placeholder="Describe the early warning in detail…" rows={4} error={errors.description?.message} {...register('description')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date Raised *" type="date" error={errors.dateRaised?.message} {...register('dateRaised')} />
            <Input label="Date Required By" type="date" {...register('dateRequired')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Assigned To" placeholder="Name or role" {...register('assignedTo')} />
            {editing && <Select label="Status" options={statusOptions} {...register('status')} />}
          </div>
          {mutation.error && <p className="text-sm text-red-600">Save failed. Please try again.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || mutation.isPending}>
              {editing ? 'Save Changes' : 'Create Early Warning'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
