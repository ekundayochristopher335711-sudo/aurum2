import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserX, UserCheck, ShieldCheck } from 'lucide-react'
import { getUsers, updateUser } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import type { User } from '../../types'
import { format, parseISO } from 'date-fns'

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  COMMERCIAL_MANAGER: 'Commercial Manager',
  VIEWER: 'Viewer',
}

export default function UsersPage() {
  const me = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [deactivating, setDeactivating] = useState<User | null>(null)

  const { data: users = [], isLoading, error } = useQuery({ queryKey: ['admin-users'], queryFn: getUsers })

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { isActive?: boolean; role?: string } }) => updateUser(id, data),
    onSuccess: (updated, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success(
        vars.data.isActive === true ? `${updated.email} approved - they can now sign in`
        : vars.data.isActive === false ? `${updated.email} deactivated`
        : `${updated.email} updated`,
      )
      setDeactivating(null)
    },
    onError: () => { toast.error('Update failed. Please try again.'); setDeactivating(null) },
  })

  if (error) return <p className="text-sm text-slate-500 py-12 text-center">Only platform admins can view this page.</p>

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-900">User Management</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {users.length} account{users.length !== 1 ? 's' : ''} · new signups need your approval before they can sign in
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-48">Global Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Joined</th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => {
                const isMe = u.id === me?.id
                return (
                  <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${u.isActive === false ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-navy-900 font-bold text-sm shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 flex items-center gap-2">
                            {u.name}
                            {isMe && <span className="text-[10px] font-semibold bg-gold-100 text-gold-700 px-1.5 py-0.5 rounded-full">YOU</span>}
                          </p>
                          <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isMe ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"><ShieldCheck className="w-3.5 h-3.5 text-gold-600" />{roleLabels[u.role]}</span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={mutation.isPending && mutation.variables?.id === u.id}
                          onChange={(e) => mutation.mutate({ id: u.id, data: { role: e.target.value } })}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gold-500 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                        >
                          <option value="VIEWER">Viewer</option>
                          <option value="COMMERCIAL_MANAGER">Commercial Manager</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.isActive === false ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {u.isActive === false ? 'Awaiting approval' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{format(parseISO(u.createdAt), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-3">
                      {!isMe && (
                        u.isActive === false ? (
                          <button
                            onClick={() => mutation.mutate({ id: u.id, data: { isActive: true } })}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 px-2 py-1.5 rounded-lg transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> Approve
                          </button>
                        ) : (
                          <button
                            onClick={() => setDeactivating(u)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors"
                          >
                            <UserX className="w-3.5 h-3.5" /> Deactivate
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        requirePassword
        open={!!deactivating}
        title={`Deactivate ${deactivating?.name}?`}
        message={`${deactivating?.email} will no longer be able to sign in. Their records and audit history are kept. You can reactivate them at any time.`}
        confirmLabel="Deactivate"
        loading={mutation.isPending}
        onConfirm={() => deactivating && mutation.mutate({ id: deactivating.id, data: { isActive: false } })}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  )
}
