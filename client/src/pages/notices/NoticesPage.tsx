import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Download, Bell } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getNotices, createNotice, deleteNotice, downloadNoticePDF } from '../../api/notices'
import { getCEs } from '../../api/compensationEvents'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import type { Notice } from '../../types'
import { useProjectRole } from '../../hooks/useProjectRole'
import { format, parseISO } from 'date-fns'

const schema = z.object({
  title: z.string().min(1, 'Title required'),
  content: z.string().min(1, 'Content required'),
  type: z.string().min(1, 'Type required'),
  issuedTo: z.string().min(1, 'Issued to required'),
  dateIssued: z.string().min(1, 'Date required'),
  ceId: z.string().optional(),
  dueDate: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const noticeTypes = [
  { value: 'EARLY_WARNING', label: 'Early Warning Notice' },
  { value: 'COMPENSATION_EVENT', label: 'Compensation Event Notice' },
  { value: 'INSTRUCTION', label: 'Project Manager Instruction' },
  { value: 'ACCEPTANCE', label: 'Acceptance' },
  { value: 'REJECTION', label: 'Rejection' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'ASSESSMENT', label: 'Assessment' },
  { value: 'GENERAL', label: 'General Notice' },
]

const typeColors: Record<string, 'info' | 'gold' | 'danger' | 'success' | 'warning' | 'default'> = {
  EARLY_WARNING: 'danger',
  COMPENSATION_EVENT: 'gold',
  INSTRUCTION: 'info',
  ACCEPTANCE: 'success',
  REJECTION: 'danger',
  QUOTATION: 'warning',
  ASSESSMENT: 'info',
  GENERAL: 'default',
}

export default function NoticesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const { canEdit } = useProjectRole()
  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState<Notice | null>(null)
  const toast = useToast()

  const { data: notices = [], isLoading } = useQuery({
    queryKey: ['notices', projectId],
    queryFn: () => getNotices(projectId!),
    enabled: !!projectId,
  })

  const { data: ces = [] } = useQuery({
    queryKey: ['ces', projectId],
    queryFn: () => getCEs(projectId!),
    enabled: !!projectId,
  })

  const ceOptions = [{ value: '', label: '- Not linked to a CE -' }, ...ces.map((ce) => ({ value: ce.id, label: `${ce.ceNumber}: ${ce.title}` }))]

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { dateIssued: new Date().toISOString().split('T')[0] },
  })

  const closeModal = () => { setModalOpen(false); reset({ dateIssued: new Date().toISOString().split('T')[0] }) }

  const mutation = useMutation({
    mutationFn: (data: FormData) => createNotice(projectId!, { ...data, ceId: data.ceId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices', projectId] })
      toast.success('Notice issued')
      closeModal()
    },
    onError: () => toast.error('Could not issue the notice. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNotice(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices', projectId] })
      toast.success(`${deleting?.noticeNumber ?? 'Notice'} deleted`)
      setDeleting(null)
    },
    onError: () => { toast.error('Delete failed - only project admins can delete records.'); setDeleting(null) },
  })

  const handleDownload = async (noticeId: string, noticeNumber: string) => {
    try {
      const blob = await downloadNoticePDF(projectId!, noticeId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${noticeNumber}.pdf`; a.click()
      URL.revokeObjectURL(url)
      toast.success(`${noticeNumber}.pdf downloaded`)
    } catch {
      toast.error('PDF download failed. Please try again.')
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Notices</h1>
          <p className="text-sm text-slate-500 mt-0.5">{notices.length} notice{notices.length !== 1 ? 's' : ''} issued</p>
        </div>
        {canEdit && <Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>Issue Notice</Button>}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : notices.length === 0 ? (
        <EmptyState title="No notices issued" description="Issue formal NEC notices linked to compensation events or standalone." action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>Issue Notice</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Notice No.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Issued To</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Date Issued</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Linked CE</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {notices.map((n) => (
                <tr key={n.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded">{n.noticeNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{n.title}</p>
                    <p className="text-xs text-slate-400 truncate max-w-sm">{n.content}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={typeColors[n.type] || 'default'}>
                      {noticeTypes.find((t) => t.value === n.type)?.label || n.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{n.issuedTo}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{format(parseISO(n.dateIssued), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{n.ce?.ceNumber ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDownload(n.id, n.noticeNumber)} title="Download PDF" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-gold-600 transition-colors"><Download className="w-4 h-4" /></button>
                      <button onClick={() => setDeleting(n)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        requirePassword
        open={!!deleting}
        title={`Delete ${deleting?.noticeNumber}?`}
        message={`"${deleting?.title}" will be permanently removed. Formal notices form part of the contractual record - deleting is recorded in the audit trail.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />

      <Modal open={modalOpen} onClose={closeModal} title="Issue Notice" size="xl">
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <Input label="Notice Title *" placeholder="e.g. Early Warning - Ground Contamination" error={errors.title?.message} {...register('title')} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Notice Type *" options={[{ value: '', label: 'Select type…' }, ...noticeTypes]} {...register('type')} error={errors.type?.message} />
            <Select label="Linked Compensation Event" options={ceOptions} {...register('ceId')} />
          </div>
          <Textarea label="Notice Content *" placeholder="Formal notice text…" rows={6} error={errors.content?.message} {...register('content')} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Issued To *" placeholder="Project Manager / Contractor" error={errors.issuedTo?.message} {...register('issuedTo')} />
            <Input label="Date Issued *" type="date" error={errors.dateIssued?.message} {...register('dateIssued')} />
            <Input label="Response Due Date" type="date" {...register('dueDate')} />
          </div>
          {mutation.error && <p className="text-sm text-red-600">Failed to issue notice. Please try again.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button type="submit" icon={<Bell className="w-4 h-4" />} loading={isSubmitting || mutation.isPending}>
              Issue Notice
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
