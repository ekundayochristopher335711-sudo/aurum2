import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ShieldAlert, FileText, Bell, ClipboardList, LayoutDashboard, UserPlus, GitBranch, Trash2, Mail, Copy, Archive, ArchiveRestore, Pencil } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getProject, addProjectMember, removeProjectMember, completeProject, reopenProject, updateProject } from '../../api/projects'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import { getDashboard } from '../../api/dashboard'
import { sendInvitation, getInvitations, revokeInvitation } from '../../api/invitations'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import CommentThread from '../../components/comments/CommentThread'
import { useProjectRole } from '../../hooks/useProjectRole'
import { useToast } from '../../components/ui/Toast'
import { useAuthStore } from '../../store/authStore'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { format, parseISO } from 'date-fns'

const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['VIEWER', 'COMMERCIAL_MANAGER', 'ADMIN']),
})
type InviteForm = z.infer<typeof inviteSchema>

type ProjectRole = 'ADMIN' | 'COMMERCIAL_MANAGER' | 'VIEWER';

type Invitation = {
  id: string;
  email: string;
  role: ProjectRole;
  expiresAt: string;
  token: string;
};

const roleColors: Record<ProjectRole, string> = {
  ADMIN: 'bg-gold-100 text-gold-700',
  COMMERCIAL_MANAGER: 'bg-blue-100 text-blue-700',
  VIEWER: 'bg-slate-100 text-slate-600',
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canEdit, role: myProjectRole, isCompleted } = useProjectRole()
  const me = useAuthStore((s) => s.user)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  // These details appear on every exported document's letterhead
  const [form, setForm] = useState({ name: '', clientName: '', contractorName: '', contractType: 'NEC4', description: '' })
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const toast = useToast()

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/accept-invitation/${token}`
    navigator.clipboard.writeText(link)
      .then(() => toast.success('Invite link copied - paste it in WhatsApp, email, anywhere'))
      .catch(() => toast.error('Could not copy. Long-press the link to copy manually.'))
  }

  // Opens the user's own email app with a ready-written invitation
  const emailLink = (email: string, token: string) => {
    const link = `${window.location.origin}/accept-invitation/${token}`
    const subject = `You're invited to join ${project?.name ?? 'a project'} on Aurum`
    const body = `Hi,\n\nYou've been invited to collaborate on "${project?.name ?? 'a project'}" in Aurum Project Controls.\n\nClick this link to set up your account (it expires in 7 days):\n${link}\n\nThanks`
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  })

  const { data: pendingInvites = [] } = useQuery<Invitation[]>({
    queryKey: ['invitations', projectId],
    queryFn: () => getInvitations(projectId!),
    enabled: !!projectId && canEdit,
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'VIEWER' },
  })

  const inviteMutation = useMutation({
    mutationFn: (data: InviteForm) => sendInvitation(projectId!, data.email, data.role),
    onSuccess: (res: { token?: string }, vars) => {
      queryClient.invalidateQueries({ queryKey: ['invitations', projectId] })
      setInviteSuccess(`Invitation created for ${vars.email}.`)
      if (res.token) {
        setInviteLink(`${window.location.origin}/accept-invitation/${res.token}`)
        setInviteToken(res.token)
      } else {
        setInviteLink('')
        setInviteToken('')
      }
      setInviteEmail(vars.email)
      reset()
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvitation(projectId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations', projectId] }),
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => addProjectMember(projectId!, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('Project role updated')
    },
    onError: () => toast.error('Could not change role - project admins only.'),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('Member removed from project')
    },
    onError: () => toast.error('Could not remove member.'),
  })

  const completeMutation = useMutation({
    mutationFn: () => completeProject(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project completed - it is now a read-only archive')
      setCompleteOpen(false)
    },
    onError: () => { toast.error('Could not complete the project.'); setCompleteOpen(false) },
  })

  const reopenMutation = useMutation({
    mutationFn: () => reopenProject(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project reopened - editing and reminders are back on')
    },
    onError: () => toast.error('Could not reopen the project.'),
  })

  const editMutation = useMutation({
    mutationFn: () => updateProject(projectId!, {
      name: form.name,
      clientName: form.clientName || undefined,
      contractorName: form.contractorName || undefined,
      contractType: form.contractType as 'NEC3' | 'NEC4',
      description: form.description || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project details updated - exported documents will use them')
      setEditOpen(false)
    },
    onError: () => toast.error('Could not save the project details.'),
  })

  const openEdit = () => {
    if (!project) return
    setForm({
      name: project.name,
      clientName: project.clientName ?? '',
      contractorName: project.contractorName ?? '',
      contractType: project.contractType,
      description: project.description ?? '',
    })
    setEditOpen(true)
  }

  const isProjectAdmin = myProjectRole === 'ADMIN'
  // Open-item counts for the completion warning
  const { data: dash } = useQuery({
    queryKey: ['dashboard', projectId],
    queryFn: () => getDashboard(projectId!),
    enabled: !!projectId && isProjectAdmin,
  })
  const openItems = (dash?.kpis.openEWs ?? 0) + (dash?.kpis.openCEs ?? 0) + (dash?.kpis.openRisks ?? 0)

  const canManageTeam = isProjectAdmin && !isCompleted

  // Invitation rights follow the user's role ON THIS PROJECT, not their global role
  const canInvite = canEdit

  if (isLoading) return <div className="text-slate-400 py-12 text-center">Loading…</div>
  if (!project) return null

  const modules = [
    { label: 'Dashboard', icon: LayoutDashboard, path: 'dashboard', count: null, color: 'bg-navy-900 text-white' },
    { label: 'Early Warnings', icon: AlertTriangle, path: 'early-warnings', count: project._count?.earlyWarnings, color: 'bg-red-50 text-red-500' },
    { label: 'Risk Register', icon: ShieldAlert, path: 'risks', count: project._count?.riskItems, color: 'bg-amber-50 text-amber-600' },
    { label: 'Compensation Events', icon: FileText, path: 'compensation-events', count: project._count?.compensationEvents, color: 'bg-blue-50 text-blue-600' },
    { label: 'Notices', icon: Bell, path: 'notices', count: project._count?.notices, color: 'bg-violet-50 text-violet-600' },
    { label: 'CE What-If', icon: GitBranch, path: 'ce-whatif', count: null, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Audit Trail', icon: ClipboardList, path: 'audit', count: null, color: 'bg-slate-100 text-slate-500' },
  ]

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header - stacks on phones so the action buttons never widen the page */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2 min-w-0">
            <span className="cursor-pointer hover:text-gold-600 transition-colors shrink-0" onClick={() => navigate('/projects')}>Projects</span>
            <span className="shrink-0">/</span>
            <span className="text-slate-700 font-medium truncate">{project.name}</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight break-words">{project.name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${project.contractType === 'NEC4' ? 'bg-gold-100 text-gold-700' : 'bg-blue-100 text-blue-700'}`}>
              {project.contractType}
            </span>
            {project.clientName && <span className="text-sm text-slate-500">Client: <span className="font-medium text-slate-700">{project.clientName}</span></span>}
            {project.contractValue && <span className="text-sm text-slate-500">Value: <span className="font-medium text-slate-700">£{project.contractValue.toLocaleString('en-GB')}</span></span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEdit && (
            <Button variant="outline" icon={<Pencil className="w-4 h-4" />} onClick={openEdit}>
              Edit Details
            </Button>
          )}
          {canInvite && (
            <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setInviteOpen(true); setInviteSuccess(''); setInviteLink(''); setInviteToken(''); }}>
              Invite Member
            </Button>
          )}
          {isProjectAdmin && !isCompleted && (
            <Button variant="outline" icon={<Archive className="w-4 h-4" />} onClick={() => setCompleteOpen(true)}>
              Complete Project
            </Button>
          )}
          {isProjectAdmin && isCompleted && (
            <Button variant="outline" icon={<ArchiveRestore className="w-4 h-4" />} loading={reopenMutation.isPending} onClick={() => reopenMutation.mutate()}>
              Reopen Project
            </Button>
          )}
        </div>
      </div>

      {/* Completed banner */}
      {isCompleted && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Archive className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">This project is completed and read-only.</span>{' '}
            All records are preserved for the contractual archive - nothing can be added or changed, and daily deadline reminders are paused. A project admin can reopen it at any time.
          </p>
        </div>
      )}

      {/* Module grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {modules.map(({ label, icon: Icon, path, count, color }) => (
          <button
            key={path}
            onClick={() => navigate(`/projects/${projectId}/${path}`)}
            className="bg-white rounded-xl border border-slate-200 shadow-card p-5 text-left hover:shadow-card-md hover:border-slate-300 transition-all group"
          >
            <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="font-medium text-slate-800 text-sm">{label}</p>
            {count !== null && count !== undefined && (
              <p className="text-2xl font-semibold text-gold-600 mt-1 tracking-tight">{count}</p>
            )}
          </button>
        ))}
      </div>

      {/* Team members */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Team Members</h3>
          <span className="text-xs text-slate-400">{project.members?.length ?? 0} members</span>
        </div>
        <div className="divide-y divide-slate-50">
          {project.members?.map((m) => (
            <div key={m.id} className="px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-navy-900 font-bold text-sm shrink-0">
                {m.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{m.user.name}</p>
                <p className="text-xs text-slate-400 truncate">{m.user.email}</p>
              </div>
              {canManageTeam && m.user.id !== me?.id ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={m.role}
                    onChange={(e) => roleMutation.mutate({ userId: m.user.id, role: e.target.value })}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-green/40 bg-white"
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="COMMERCIAL_MANAGER">Commercial Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button
                    onClick={() => removeMutation.mutate(m.user.id)}
                    title="Remove from project"
                    className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${roleColors[m.role] ?? 'bg-slate-100 text-slate-600'}`}>
                  {m.role.replace('_', ' ')}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Pending invitations */}
        {pendingInvites.length > 0 && (
          <>
            <div className="px-5 py-3 border-t border-slate-100 border-dashed">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Invitations</p>
            </div>
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center gap-3 border-t border-dashed border-slate-100 bg-slate-50/50">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-600">{inv.email}</p>
                  <p className="text-xs text-slate-400">Expires {format(parseISO(inv.expiresAt), 'dd MMM yyyy')}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${roleColors[inv.role] ?? 'bg-slate-100 text-slate-600'}`}>
                  {inv.role.replace('_', ' ')}
                </span>
                <button onClick={() => copyLink(inv.token)} title="Copy invite link" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => emailLink(inv.email, inv.token)} title="Send by email" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                  <Mail className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => revokeMutation.mutate(inv.id)} title="Revoke invitation" className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Project-wide discussion between client and contractor */}
      <CommentThread targetType="PROJECT" title="Project Discussion" />

      <ConfirmDialog
        requirePassword
        open={completeOpen}
        title={`Complete ${project.name}?`}
        message={
          openItems > 0
            ? `⚠️ ${dash?.kpis.openEWs ?? 0} early warning(s), ${dash?.kpis.openRisks ?? 0} risk(s) and ${dash?.kpis.openCEs ?? 0} compensation event(s) are still open. The project will become read-only and daily reminders will stop. You can reopen it later.`
            : 'The project will become a read-only archive: records preserved, exports available, daily reminders stopped. You can reopen it later.'
        }
        confirmLabel="Complete Project"
        loading={completeMutation.isPending}
        onConfirm={() => completeMutation.mutate()}
        onCancel={() => setCompleteOpen(false)}
      />

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Project Details" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            These details appear on the letterhead of every notice, report and export for this project.
          </p>
          <Input label="Project Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Client Name" placeholder="e.g. NHS" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            <Input label="Contractor Name" placeholder="e.g. Robertson Group" value={form.contractorName} onChange={(e) => setForm({ ...form, contractorName: e.target.value })} />
          </div>
          <Select
            label="Contract Type"
            options={[{ value: 'NEC4', label: 'NEC4' }, { value: 'NEC3', label: 'NEC3' }]}
            value={form.contractType}
            onChange={(e) => setForm({ ...form, contractType: e.target.value })}
          />
          <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button loading={editMutation.isPending} disabled={!form.name.trim()} onClick={() => editMutation.mutate()}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Team Member" size="sm">
        <form onSubmit={handleSubmit((d) => inviteMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
            <input
              type="email"
              placeholder="colleague@company.com"
              className={`w-full px-3.5 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-brand-green/40 ${errors.email ? 'border-red-400' : 'border-slate-200'}`}
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
            <select className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40" {...register('role')}>
              <option value="VIEWER">Viewer - read only</option>
              <option value="COMMERCIAL_MANAGER">Commercial Manager - can create & edit</option>
              <option value="ADMIN">Admin - full access</option>
            </select>
          </div>

          {inviteSuccess && (
            <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-3 space-y-2">
              <p className="text-sm text-green-700 font-medium">{inviteSuccess}</p>
              {inviteLink && (
                <>
                  <p className="text-xs text-slate-500">Share this link with them directly - it works even without email set up:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-2 truncate">{inviteLink}</code>
                    <Button type="button" size="sm" variant="outline" icon={<Copy className="w-3.5 h-3.5" />} onClick={() => copyLink(inviteToken)}>
                      Copy
                    </Button>
                    <Button type="button" size="sm" variant="outline" icon={<Mail className="w-3.5 h-3.5" />} onClick={() => emailLink(inviteEmail, inviteToken)}>
                      Email it
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          {inviteMutation.isError && <p className="text-sm text-red-600">Failed to send invitation. Please try again.</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="submit" icon={<Mail className="w-4 h-4" />} loading={isSubmitting || inviteMutation.isPending}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
