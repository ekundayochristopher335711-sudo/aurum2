import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Upload, ChevronRight, MessageSquare } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getCEs, createCE, updateCE, deleteCE, uploadDocument } from '../../api/compensationEvents'
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
import type { CompensationEvent } from '../../types'
import { useProjectRole } from '../../hooks/useProjectRole'
import { format, parseISO, differenceInDays } from 'date-fns'

const schema = z.object({
  title: z.string().min(1, 'Title required'),
  description: z.string().min(1, 'Description required'),
  dateNotified: z.string().min(1, 'Date required'),
  dateAwareness: z.string().optional(),
  clauseRef: z.string().optional(),
  dateResponseDue: z.string().optional(),
  valuationAmount: z.string().optional(),
  status: z.enum(['NOTIFIED', 'QUOTED', 'ASSESSED', 'IMPLEMENTED', 'CLOSED']).optional(),
})

// NEC cl. 61.3 - a CE must be notified within 8 weeks of awareness
const TIME_BAR_DAYS = 56

function TimeBarHint({ awareness, notified }: { awareness?: string; notified?: string }) {
  if (!awareness) return null
  const deadline = new Date(new Date(awareness).getTime() + TIME_BAR_DAYS * 24 * 60 * 60 * 1000)
  const ref = notified ? new Date(notified) : new Date()
  const daysLeft = differenceInDays(deadline, ref)
  if (daysLeft < 0) return (
    <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
      ⚠️ Time-barred: notification is {-daysLeft} day{daysLeft !== -1 ? 's' : ''} past the 8-week limit under NEC cl. 61.3 - entitlement may be lost.
    </p>
  )
  return (
    <p className={`text-xs font-medium rounded-lg px-3 py-2 border ${daysLeft <= 14 ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-emerald-700 bg-emerald-50 border-emerald-100'}`}>
      ⏱ {daysLeft} day{daysLeft !== 1 ? 's' : ''} left on the 8-week notification clock (NEC cl. 61.3) - expires {format(deadline, 'dd MMM yyyy')}.
    </p>
  )
}

function DeadlineClock({ ce }: { ce: CompensationEvent }) {
  if (ce.status === 'CLOSED') return <span className="text-xs text-slate-300">-</span>
  const due = ce.status === 'NOTIFIED' && ce.dateQuotationDue && (!ce.dateResponseDue || new Date(ce.dateQuotationDue) < new Date(ce.dateResponseDue))
    ? { date: ce.dateQuotationDue, label: 'quote' }
    : ce.dateResponseDue ? { date: ce.dateResponseDue, label: 'reply' } : null
  if (!due) return <span className="text-xs text-slate-300">-</span>
  const days = differenceInDays(parseISO(due.date), new Date())
  if (days < 0) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{-days}d overdue
    </span>
  )
  const style = days <= 3 ? 'text-red-600 bg-red-50' : days <= 7 ? 'text-amber-700 bg-amber-50' : 'text-slate-600 bg-slate-100'
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${style}`}>{days}d to {due.label}</span>
}
type FormData = z.infer<typeof schema>

const statusOptions = [
  { value: 'NOTIFIED', label: 'Notified' },
  { value: 'QUOTED', label: 'Quoted' },
  { value: 'ASSESSED', label: 'Assessed' },
  { value: 'IMPLEMENTED', label: 'Implemented' },
  { value: 'CLOSED', label: 'Closed' },
]

const NEC_WORKFLOW = ['NOTIFIED', 'QUOTED', 'ASSESSED', 'IMPLEMENTED', 'CLOSED']

function WorkflowProgress({ status }: { status: string }) {
  const idx = NEC_WORKFLOW.indexOf(status)
  return (
    <div className="flex items-center gap-0.5">
      {NEC_WORKFLOW.map((s, i) => (
        <div key={s} className="flex items-center gap-0.5">
          <div className={`h-1.5 w-8 rounded-full ${i <= idx ? 'bg-gold-500' : 'bg-slate-200'}`} />
          {i < NEC_WORKFLOW.length - 1 && <ChevronRight className="w-2 h-2 text-slate-300" />}
        </div>
      ))}
    </div>
  )
}

export default function CompensationEventsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const { canEdit } = useProjectRole()
  const toast = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CompensationEvent | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [uploadCeId, setUploadCeId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CompensationEvent | null>(null)
  const [discussing, setDiscussing] = useState<CompensationEvent | null>(null)

  const { data: unreadCounts = [] } = useQuery({
    queryKey: ['unread', projectId],
    queryFn: () => getUnreadCounts(projectId!),
    enabled: !!projectId,
  })
  const unreadFor = (id: string) =>
    unreadCounts.find((u) => u.targetType === 'COMPENSATION_EVENT' && u.targetId === id)?.count ?? 0

  const { data: ces = [], isLoading } = useQuery({
    queryKey: ['ces', projectId, statusFilter],
    queryFn: () => getCEs(projectId!, statusFilter || undefined),
    enabled: !!projectId,
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { dateNotified: new Date().toISOString().split('T')[0] },
  })

  const openEdit = (ce: CompensationEvent) => {
    setEditing(ce)
    setValue('title', ce.title)
    setValue('description', ce.description)
    setValue('dateNotified', ce.dateNotified.split('T')[0])
    setValue('dateAwareness', ce.dateAwareness ? ce.dateAwareness.split('T')[0] : '')
    setValue('clauseRef', ce.clauseRef || '')
    setValue('dateResponseDue', ce.dateResponseDue ? ce.dateResponseDue.split('T')[0] : '')
    setValue('valuationAmount', ce.valuationAmount != null ? String(ce.valuationAmount) : '')
    setValue('status', ce.status)
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null); reset({ dateNotified: new Date().toISOString().split('T')[0] }) }

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        title: data.title,
        description: data.description,
        dateNotified: data.dateNotified,
        dateAwareness: data.dateAwareness || (editing ? null : undefined),
        clauseRef: data.clauseRef || undefined,
        // On edit, empty values clear the field (null); on create they are simply omitted
        dateResponseDue: data.dateResponseDue || (editing ? null : undefined),
        valuationAmount: data.valuationAmount ? Number(data.valuationAmount) : (editing ? null : undefined),
        status: data.status,
      }
      return editing ? updateCE(projectId!, editing.id, payload) : createCE(projectId!, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ces', projectId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      toast.success(editing ? 'Compensation event updated' : 'Compensation event created')
      closeModal()
    },
    onError: () => toast.error('Could not save the compensation event. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCE(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ces', projectId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      toast.success(`${deleting?.ceNumber ?? 'CE'} deleted`)
      setDeleting(null)
    },
    onError: () => { toast.error('Delete failed - only project admins can delete records.'); setDeleting(null) },
  })

  const uploadMutation = useMutation({
    mutationFn: ({ ceId, file }: { ceId: string; file: File }) => uploadDocument(projectId!, ceId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ces', projectId] })
      toast.success('Document uploaded')
      setUploadCeId(null)
    },
    onError: () => toast.error('Upload failed. Files must be under 10MB.'),
  })

  // Client-side search so it stays instant once a project has dozens of CEs
  const q = search.trim().toLowerCase()
  const visibleCEs = q
    ? ces.filter((ce) =>
        ce.ceNumber.toLowerCase().includes(q) ||
        ce.title.toLowerCase().includes(q) ||
        ce.description.toLowerCase().includes(q) ||
        (ce.clauseRef ?? '').toLowerCase().includes(q))
    : ces

  const totalValue = ces.reduce((sum, ce) => sum + (ce.valuationAmount ?? 0), 0)

  return (
    <div className="max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Compensation Events</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {ces.length} event{ces.length !== 1 ? 's' : ''} · Total valuation: <span className="font-semibold text-gold-600">£{totalValue.toLocaleString('en-GB')}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search CEs…"
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 w-44 focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="">All Statuses</option>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {canEdit && <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setModalOpen(true) }}>New CE</Button>}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : ces.length === 0 ? (
        <EmptyState title="No compensation events" description="Log compensation events following NEC clause 60 onwards." action={canEdit ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>New CE</Button> : undefined} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">CE No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Clause</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Notified</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Due</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Clock</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Valuation</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Workflow</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Status</th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleCEs.map((ce) => {
                const isOverdue = ce.dateResponseDue && new Date(ce.dateResponseDue) < new Date() && ce.status !== 'CLOSED'
                const daysLeft = ce.dateResponseDue ? differenceInDays(parseISO(ce.dateResponseDue), new Date()) : null
                return (
                  <tr key={ce.id} className={`hover:bg-slate-50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded">{ce.ceNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{ce.title}</p>
                      <p className="text-xs text-slate-400 truncate max-w-xs">{ce.description}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{ce.clauseRef || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{format(parseISO(ce.dateNotified), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-3 text-xs">
                      {ce.dateResponseDue ? (
                        <span className={isOverdue ? 'text-red-600 font-medium' : daysLeft !== null && daysLeft <= 7 ? 'text-amber-600' : 'text-slate-600'}>
                          {format(parseISO(ce.dateResponseDue), 'dd MMM yyyy')}
                          {isOverdue && <span className="block text-red-500">Overdue</span>}
                          {!isOverdue && daysLeft !== null && daysLeft <= 7 && <span className="block text-amber-500">{daysLeft}d left</span>}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3"><DeadlineClock ce={ce} /></td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">
                      {ce.valuationAmount != null ? `£${ce.valuationAmount.toLocaleString('en-GB')}` : 'TBD'}
                    </td>
                    <td className="px-4 py-3"><WorkflowProgress status={ce.status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={ce.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDiscussing(ce)} title="Comments & photos" className="relative p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                          <MessageSquare className="w-4 h-4" />
                          {unreadFor(ce.id) > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                              {unreadFor(ce.id)}
                            </span>
                          )}
                        </button>
                        {canEdit && <button onClick={() => { setUploadCeId(ce.id) }} title="Upload document" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><Upload className="w-4 h-4" /></button>}
                        {canEdit && <button onClick={() => openEdit(ce)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><Pencil className="w-4 h-4" /></button>}
                        {canEdit && <button onClick={() => setDeleting(ce)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? `Edit ${editing.ceNumber}` : 'New Compensation Event'} size="xl">
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <Input label="Title *" placeholder="e.g. Client instruction to change scope at zone 2" error={errors.title?.message} {...register('title')} />
          <Textarea label="Description *" placeholder="Detailed description of the compensation event…" rows={4} error={errors.description?.message} {...register('description')} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="NEC Clause Reference" placeholder="60.1(1)" {...register('clauseRef')} />
            <Input label="Date Notified *" type="date" error={errors.dateNotified?.message} {...register('dateNotified')} />
            <Input label="Response Due Date" type="date" {...register('dateResponseDue')} />
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <Input label="Date Became Aware (cl. 61.3)" type="date" {...register('dateAwareness')} />
            <div className="col-span-2">
              <TimeBarHint awareness={watch('dateAwareness')} notified={watch('dateNotified')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valuation Amount (£)" type="number" placeholder="25000" {...register('valuationAmount')} />
            {/* NEC workflow is forward-only - earlier stages are not offered */}
            {editing && <Select label="Status" options={statusOptions.filter((o) => NEC_WORKFLOW.indexOf(o.value) >= NEC_WORKFLOW.indexOf(editing.status))} {...register('status')} />}
          </div>
          {!editing && (
            <p className="text-xs text-slate-400">
              If no response date is set, the NEC4 cl. 61.4 one-week reply period is applied automatically.
            </p>
          )}
          {mutation.error && <p className="text-sm text-red-600">Save failed. Please try again.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || mutation.isPending}>
              {editing ? 'Save Changes' : 'Create CE'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!discussing} onClose={() => setDiscussing(null)} title={discussing ? `${discussing.ceNumber} - ${discussing.title}` : ''} size="lg">
        {discussing && (
          <div className="space-y-6">
            <PhotoProofs ceId={discussing.id} />
            <div className="border-t border-slate-100 pt-5">
              <CommentThread targetType="COMPENSATION_EVENT" targetId={discussing.id} compact />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        requirePassword
        open={!!deleting}
        title={`Delete ${deleting?.ceNumber}?`}
        message={`"${deleting?.title}" and its documents will be permanently removed. This action is recorded in the audit trail.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />

      <Modal open={!!uploadCeId} onClose={() => setUploadCeId(null)} title="Upload Document" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Select a file to attach to this compensation event (max 10MB).</p>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg"
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gold-50 file:text-gold-700 hover:file:bg-gold-100"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file && uploadCeId) uploadMutation.mutate({ ceId: uploadCeId, file })
            }}
          />
          {uploadMutation.isPending && <p className="text-sm text-slate-400">Uploading…</p>}
          {uploadMutation.isSuccess && <p className="text-sm text-green-600">Upload successful.</p>}
        </div>
      </Modal>
    </div>
  )
}
