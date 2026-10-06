import express from 'express'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = express.Router()

const DUE_SOON_DAYS = 7

// Everything waiting on this person, across every project they belong to.
// This is the landing page of the app: "what needs me today?"
router.get('/actions', authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.user!.id
    const isPlatformAdmin = req.user!.role === 'ADMIN'

    const memberships = await prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    })
    const projectIds = isPlatformAdmin
      ? (await prisma.project.findMany({ where: { isActive: true }, select: { id: true } })).map((p) => p.id)
      : memberships.map((m) => m.projectId)

    if (projectIds.length === 0) {
      res.json({ overdueCEs: [], dueSoonCEs: [], myEarlyWarnings: [], unread: [], totals: { overdue: 0, dueSoon: 0, earlyWarnings: 0, unread: 0 } })
      return
    }

    // Completed projects are archives - nothing there needs action
    const activeIds = (await prisma.project.findMany({
      where: { id: { in: projectIds }, isActive: true },
      select: { id: true },
    })).map((p) => p.id)

    const now = new Date()
    const soon = new Date(now.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000)
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })

    const [openCEs, earlyWarnings, views, comments] = await Promise.all([
      prisma.compensationEvent.findMany({
        where: { projectId: { in: activeIds }, status: { not: 'CLOSED' } },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { dateResponseDue: 'asc' },
      }),
      prisma.earlyWarning.findMany({
        where: { projectId: { in: activeIds }, status: 'OPEN' },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { dateRaised: 'desc' },
      }),
      prisma.commentView.findMany({ where: { userId } }),
      prisma.comment.findMany({
        where: { projectId: { in: activeIds }, authorId: { not: userId } },
        select: { id: true, projectId: true, targetType: true, targetId: true, createdAt: true, visibility: true },
      }),
    ])

    // The next deadline on a CE is whichever clock is running
    const dueDateOf = (ce: typeof openCEs[number]): Date | null => {
      if (ce.status === 'NOTIFIED' && ce.dateQuotationDue && (!ce.dateResponseDue || ce.dateQuotationDue < ce.dateResponseDue)) {
        return ce.dateQuotationDue
      }
      return ce.dateResponseDue
    }

    const shape = (ce: typeof openCEs[number]) => ({
      id: ce.id,
      ceNumber: ce.ceNumber,
      title: ce.title,
      status: ce.status,
      dueDate: dueDateOf(ce),
      projectId: ce.projectId,
      projectName: ce.project.name,
    })

    const withDue = openCEs.filter((ce) => dueDateOf(ce) !== null)
    const overdueCEs = withDue.filter((ce) => dueDateOf(ce)! < now).map(shape)
    const dueSoonCEs = withDue.filter((ce) => {
      const d = dueDateOf(ce)!
      return d >= now && d < soon
    }).map(shape)

    // assignedTo is free text, so match loosely against the person's name/email
    const needle = (me?.name ?? '').toLowerCase()
    const email = (me?.email ?? '').toLowerCase()
    const myEarlyWarnings = earlyWarnings
      .filter((ew) => {
        const a = (ew.assignedTo ?? '').toLowerCase()
        return ew.raisedBy === userId || (a.length > 0 && (a.includes(needle) || a.includes(email)))
      })
      .slice(0, 20)
      .map((ew) => ({
        id: ew.id,
        ewNumber: ew.ewNumber,
        title: ew.title,
        dateRaised: ew.dateRaised,
        dateRequired: ew.dateRequired,
        projectId: ew.projectId,
        projectName: ew.project.name,
      }))

    // Unread = posted after this person last opened that thread
    const viewKey = (t: string, id: string) => `${t}:${id}`
    const lastRead = new Map(views.map((v) => [viewKey(v.targetType, v.targetId), v.lastReadAt]))
    const unreadByThread = new Map<string, { projectId: string; targetType: string; targetId: string; count: number; latest: Date }>()
    for (const c of comments) {
      const seenAt = lastRead.get(viewKey(c.targetType, c.targetId))
      if (seenAt && c.createdAt <= seenAt) continue
      const k = viewKey(c.targetType, c.targetId)
      const entry = unreadByThread.get(k)
      if (entry) {
        entry.count += 1
        if (c.createdAt > entry.latest) entry.latest = c.createdAt
      } else {
        unreadByThread.set(k, { projectId: c.projectId, targetType: c.targetType, targetId: c.targetId, count: 1, latest: c.createdAt })
      }
    }
    const projectNames = new Map(
      (await prisma.project.findMany({ where: { id: { in: activeIds } }, select: { id: true, name: true } }))
        .map((p) => [p.id, p.name]),
    )
    const unread = [...unreadByThread.values()]
      .sort((a, b) => b.latest.getTime() - a.latest.getTime())
      .slice(0, 20)
      .map((u) => ({ ...u, projectName: projectNames.get(u.projectId) ?? 'Project' }))

    res.json({
      overdueCEs,
      dueSoonCEs,
      myEarlyWarnings,
      unread,
      totals: {
        overdue: overdueCEs.length,
        dueSoon: dueSoonCEs.length,
        earlyWarnings: myEarlyWarnings.length,
        unread: unread.reduce((s, u) => s + u.count, 0),
      },
    })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
