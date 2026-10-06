import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, FileSpreadsheet, Upload, LayoutGrid, List } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getRisks, createRisk, updateRisk, deleteRisk } from '../../api/risks'
import { useProjectRole } from '../../hooks/useProjectRole'
import { getEarlyWarnings } from '../../api/earlyWarnings'
import { downloadExcel, importRisksFromExcel } from '../../api/dashboard'
import RiskHeatmap from '../../components/risks/RiskHeatmap'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import type { RiskItem } from '../../types'

const schema = z.object({
  description: z.string().min(1, 'Description required'),
  probability: z.string().min(1),
  costImpact: z.string().optional(),
  timeImpact: z.string().optional(),
  mitigation: z.string().optional(),
  owner: z.string().optional(),
  earlyWarningId: z.string().optional(),
  status: z.enum(['OPEN', 'MITIGATED', 'CLOSED']).optional(),
})
type FormData = z.infer<typeof schema>

const probabilityOptions = [
  { value: '1', label: '1 - Very Low' },
  { value: '2', label: '2 - Low' },
  { value: '3', label: '3 - Medium' },
  { value: '4', label: '4 - High' },
  { value: '5', label: '5 - Very High' },
]
const statusOptions = [
  { value: 'OPEN', label: 'Open' },
  { value: 'MITIGATED', label: 'Mitigated' },
  { value: 'CLOSED', label: 'Closed' },
]
const probColors = ['', 'bg-green-100 text-green-700', 'bg-lime-100 text-lime-700', 'bg-yellow-100 text-yellow-700', 'bg-orange-100 text-orange-700', 'bg-red-100 text-red-700']

export default function RisksPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const { canEdit } = useProjectRole()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RiskItem | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [view, setView] = useState<'list' | 'heatmap'>('list')
  const importRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState('')
  const [deleting, setDeleting] = useState<RiskItem | null>(null)
  const toast = useToast()

  const { data: risks = [], isLoading } = useQuery({
    queryKey: ['risks', projectId, statusFilter],
    queryFn: () => getRisks(projectId!, statusFilter || undefined),
    enabled: !!projectId,
  })

  const { data: ews = [] } = useQuery({
    queryKey: ['early-warnings', projectId],
    queryFn: () => getEarlyWarnings(projectId!),
    enabled: !!projectId,
  })

  const ewOptions = [{ value: '', label: '- None -' }, ...ews.map((ew) => ({ value: ew.id, label: `${ew.ewNumber}: ${ew.title}` }))]

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { probability: '3' },
  })

  const openEdit = (r: RiskItem) => {
    setEditing(r)
    setValue('description', r.description)
    setValue('probability', String(r.probability))
    setValue('costImpact', r.costImpact != null ? String(r.costImpact) : '')
    setValue('timeImpact', r.timeImpact != null ? String(r.timeImpact) : '')
    setValue('mitigation', r.mitigation || '')
    setValue('owner', r.owner || '')
    setValue('earlyWarningId', r.earlyWarningId || '')
    setValue('status', r.status)
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null); reset({ probability: '3' }) }

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        description: data.description,
        probability: Number(data.probability),
        // On edit, empty values clear the field (null); on create they are simply omitted
        costImpact: data.costImpact ? Number(data.costImpact) : (editing ? null : undefined),
        timeImpact: data.timeImpact ? Number(data.timeImpact) : (editing ? null : undefined),
        mitigation: data.mitigation || undefined,
        owner: data.owner || undefined,
        earlyWarningId: data.earlyWarningId || (editing ? null : undefined),
        status: data.status,
      }
      return editing ? updateRisk(projectId!, editing.id, payload) : createRisk(projectId!, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks', projectId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      toast.success(editing ? 'Risk updated' : 'Risk added to register')
      closeModal()
    },
    onError: () => toast.error('Could not save the risk. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRisk(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks', projectId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
      toast.success(`${deleting?.riskId ?? 'Risk'} deleted`)
      setDeleting(null)
    },
    onError: () => { toast.error('Delete failed - only project admins can delete records.'); setDeleting(null) },
  })

  const totalExposure = risks.filter((r) => r.status === 'OPEN').reduce((sum, r) => sum + (r.costImpact ?? 0), 0)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await importRisksFromExcel(projectId!, file)
      setImportMsg(`✓ Imported ${result.imported} risks${result.errors.length ? ` (${result.errors.length} skipped)` : ''}`)
      queryClient.invalidateQueries({ queryKey: ['risks', projectId] })
    } catch {
      setImportMsg('Import failed - check file format')
    }
    e.target.value = ''
  }

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Risk Register</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {risks.length} item{risks.length !== 1 ? 's' : ''} · Open exposure: <span className="font-semibold text-red-600">£{totalExposure.toLocaleString('en-GB')}</span>
          </p>
          {importMsg && <p className="text-xs text-green-600 mt-1">{importMsg}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => setView('list')} className={`p-2 rounded-lg border transition-colors ${view === 'list' ? 'bg-navy-900 text-white border-navy-900' : 'border-slate-300 text-slate-500 hover:border-slate-400'}`}><List className="w-4 h-4" /></button>
          <button onClick={() => setView('heatmap')} className={`p-2 rounded-lg border transition-colors ${view === 'heatmap' ? 'bg-navy-900 text-white border-navy-900' : 'border-slate-300 text-slate-500 hover:border-slate-400'}`}><LayoutGrid className="w-4 h-4" /></button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="">All Statuses</option>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          {canEdit && <Button variant="outline" size="sm" icon={<Upload className="w-4 h-4" />} onClick={() => importRef.current?.click()}>Import</Button>}
          <Button variant="outline" size="sm" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => downloadExcel(projectId!, 'risks')}>Export</Button>
          {canEdit && <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setModalOpen(true) }}>Add Risk</Button>}
        </div>
      </div>

      {view === 'heatmap' && <div className="mb-6"><RiskHeatmap risks={risks} onCellClick={() => setView('list')} /></div>}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : risks.length === 0 ? (
        <EmptyState title="No risks logged" description="Add risks to track probability, cost impact, and mitigation actions." action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>Add Risk</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Risk ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Prob.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Cost (£)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Days</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Linked EW</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {risks.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-navy-900 bg-navy-50 px-2 py-0.5 rounded">{r.riskId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 truncate max-w-xs">{r.description}</p>
                    {r.mitigation && <p className="text-xs text-slate-400 truncate max-w-xs">Mitigation: {r.mitigation}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${probColors[r.probability]}`}>{r.probability}/5</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs font-medium">{r.costImpact != null ? `£${r.costImpact.toLocaleString('en-GB')}` : '-'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{r.timeImpact != null ? `${r.timeImpact}d` : '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.earlyWarning?.ewNumber ?? '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleting(r)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
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
        title={`Delete ${deleting?.riskId}?`}
        message={`"${deleting?.description?.slice(0, 80)}" will be permanently removed from the register. This action is recorded in the audit trail.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />

      <Modal open={modalOpen} onClose={closeModal} title={editing ? `Edit ${editing.riskId}` : 'New Risk Item'} size="lg">
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <Textarea label="Description *" placeholder="Describe the risk…" rows={3} error={errors.description?.message} {...register('description')} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Probability (1-5) *" options={probabilityOptions} {...register('probability')} />
            {editing && <Select label="Status" options={statusOptions} {...register('status')} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cost Impact (£)" type="number" placeholder="50000" {...register('costImpact')} />
            <Input label="Time Impact (days)" type="number" placeholder="14" {...register('timeImpact')} />
          </div>
          <Textarea label="Mitigation Action" placeholder="Describe mitigation steps…" rows={2} {...register('mitigation')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Risk Owner" placeholder="Name or role" {...register('owner')} />
            <Select label="Linked Early Warning" options={ewOptions} {...register('earlyWarningId')} />
          </div>
          {mutation.error && <p className="text-sm text-red-600">Save failed. Please try again.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || mutation.isPending}>
              {editing ? 'Save Changes' : 'Add Risk'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
