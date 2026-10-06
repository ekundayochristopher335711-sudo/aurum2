import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { getProject } from '../api/projects'

export function useProjectRole() {
  const { projectId } = useParams<{ projectId: string }>()
  const user = useAuthStore((s) => s.user)

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  })

  // Completed projects are a read-only archive for everyone, admins included
  const isCompleted = project ? project.isActive === false : false

  if (!user || !projectId) return { role: null, isViewer: true, canEdit: false, isCompleted }

  // Global admins can always edit (while the project is active)
  if (user.role === 'ADMIN') return { role: 'ADMIN', isViewer: false, canEdit: !isCompleted, isCompleted }

  const member = project?.members?.find((m) => m.user.id === user.id)
  const role = member?.role ?? 'VIEWER'
  const isViewer = role === 'VIEWER'
  const canEdit = !isViewer && !isCompleted

  return { role, isViewer, canEdit, isCompleted }
}
