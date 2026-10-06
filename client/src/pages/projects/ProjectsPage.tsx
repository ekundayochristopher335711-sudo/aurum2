import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, Calendar, FileText } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getProjects, createProject } from '../../api/projects'
import { useAuthStore } from '../../store/authStore'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import EmptyState from '../../components/ui/EmptyState'
import type { Project } from '../../types'
import { format, parseISO } from 'date-fns'

const schema = z.object({
  name: z.string().min(1, 'Project name is required'),
  contractType: z.enum(['NEC3', 'NEC4']),
  clientName: z.string().optional(),
  contractorName: z.string().optional(),
  contractValue: z.string().optional(),
  description: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/projects/${project.id}/dashboard`)}
      className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-gold-300 transition-all cursor-pointer p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-navy-900 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-gold-500" />
        </div>
        <span className="flex items-center gap-1.5">
          {project.isActive === false && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Completed</span>
          )}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${project.contractType === 'NEC4' ? 'bg-gold-100 text-gold-700' : 'bg-blue-100 text-blue-700'}`}>
            {project.contractType}
          </span>
        </span>
      </div>
      <h3 className="font-semibold text-navy-900 text-base leading-snug mb-1">{project.name}</h3>
      {project.clientName && <p className="text-xs text-slate-500 mb-3">Client: {project.clientName}</p>}
      {project.description && <p className="text-sm text-slate-500 line-clamp-2 mb-3">{project.description}</p>}
      <div className="flex items-center gap-4 text-xs text-slate-400 border-t border-slate-50 pt-3">
        <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {project._count?.compensationEvents ?? 0} CEs</span>
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {format(parseISO(project.createdAt), 'dd MMM yyyy')}</span>
        {project.contractValue && <span className="ml-auto font-medium text-slate-600">£{(project.contractValue / 1e6).toFixed(1)}M</span>}
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  // Global VIEWERs (invitation-only accounts) cannot create projects
  const canCreate = user?.role === 'ADMIN' || user?.role === 'COMMERCIAL_MANAGER'
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { contractType: 'NEC4' },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => createProject({
      ...data,
      contractValue: data.contractValue ? Number(data.contractValue) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setModalOpen(false)
      reset()
    },
  })

  const activeProjects = projects.filter((p) => p.isActive !== false)
  const completedProjects = projects.filter((p) => p.isActive === false)

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Projects</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}
            {completedProjects.length > 0 && ` · ${completedProjects.length} completed`}
          </p>
        </div>
        {canCreate && <Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>New Project</Button>}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState title="No projects yet" description={canCreate ? 'Create your first NEC project to get started.' : 'Projects you are invited to will appear here.'} action={canCreate ? <Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>New Project</Button> : undefined} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
          {completedProjects.length > 0 && (
            <>
              <div className="flex items-center gap-3 mt-10 mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed - read-only archive</p>
                <div className="flex-1 border-t border-dashed border-slate-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
                {completedProjects.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); reset() }} title="New Project" size="lg">
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <Input label="Project Name *" placeholder="M25 Extension Phase 2" error={errors.name?.message} {...register('name')} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Contract Type" options={[{ value: 'NEC4', label: 'NEC4' }, { value: 'NEC3', label: 'NEC3' }]} {...register('contractType')} />
            <Input label="Contract Value (£)" type="number" placeholder="45000000" {...register('contractValue')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Client Name" placeholder="National Highways" {...register('clientName')} />
            <Input label="Contractor Name" placeholder="Aurum Civil Ltd" {...register('contractorName')} />
          </div>
          <Textarea label="Description" placeholder="Brief project overview…" rows={3} {...register('description')} />
          {mutation.error && <p className="text-sm text-red-600">Failed to create project. Please try again.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setModalOpen(false); reset() }}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Project</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
