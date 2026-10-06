import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send, Trash2, Lock, SmilePlus } from 'lucide-react'
import {
  getComments, addComment, deleteComment, toggleReaction,
  CommentTarget, CommentVisibility, Comment, Reaction,
} from '../../api/comments'
import { markThreadRead } from '../../api/myActions'
import { useAuthStore } from '../../store/authStore'
import { useProjectRole } from '../../hooks/useProjectRole'
import { useToast } from '../ui/Toast'
import Button from '../ui/Button'
import { format, parseISO } from 'date-fns'

const QUICK_REACTIONS = ['👍', '✅', '❓', '⚠️', '👀', '🙏']

interface Props {
  targetType: CommentTarget
  targetId?: string
  title?: string
  compact?: boolean
}

// Groups reactions by emoji so we can show "👍 3" and who reacted on hover
function groupReactions(reactions: Reaction[]) {
  const map = new Map<string, Reaction[]>()
  reactions.forEach((r) => {
    const list = map.get(r.emoji) ?? []
    list.push(r)
    map.set(r.emoji, list)
  })
  return [...map.entries()]
}

function ReactionBar({ comment, onToggle }: { comment: Comment; onToggle: (emoji: string) => void }) {
  const me = useAuthStore((s) => s.user)
  const { isCompleted } = useProjectRole()
  const [picking, setPicking] = useState(false)
  const groups = groupReactions(comment.reactions ?? [])

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1.5">
      {groups.map(([emoji, list]) => {
        const mine = list.some((r) => r.userId === me?.id)
        return (
          <button
            key={emoji}
            disabled={isCompleted}
            onClick={() => onToggle(emoji)}
            title={list.map((r) => r.user.name).join(', ')}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs transition-colors ${
              mine ? 'bg-gold-50 border-gold-200 text-gold-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            } disabled:cursor-default`}
          >
            <span>{emoji}</span>
            <span className="font-medium">{list.length}</span>
          </button>
        )
      })}

      {!isCompleted && (
        <div className="relative">
          <button
            onClick={() => setPicking((v) => !v)}
            title="Add reaction"
            className="p-1 rounded-full text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
          {picking && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPicking(false)} />
              <div className="absolute bottom-full left-0 mb-1 z-20 flex gap-0.5 bg-white border border-slate-200 rounded-full shadow-card-lg px-1.5 py-1">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onToggle(emoji); setPicking(false) }}
                    className="text-base leading-none p-1 rounded-full hover:bg-slate-100 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function CommentThread({ targetType, targetId, title = 'Discussion', compact }: Props) {
  const { projectId } = useParams<{ projectId: string }>()
  const me = useAuthStore((s) => s.user)
  const { role, isCompleted } = useProjectRole()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [restricted, setRestricted] = useState(false)

  const key = ['comments', projectId, targetType, targetId ?? projectId]
  const canRestrict = role === 'ADMIN' || role === 'COMMERCIAL_MANAGER'

  const { data: comments = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getComments(projectId!, targetType, targetId),
    enabled: !!projectId,
  })

  const addMutation = useMutation({
    mutationFn: (body: string) => addComment(projectId!, targetType, body, targetId, restricted ? 'MANAGERS_ONLY' : 'EVERYONE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      setDraft('')
    },
    onError: () => toast.error('Could not post your comment. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteComment(projectId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Could not delete the comment.'),
  })

  // Opening the thread marks it read, clearing its unread badge
  useEffect(() => {
    if (!projectId || isLoading) return
    markThreadRead(projectId, targetType, targetId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['unread', projectId] })
        queryClient.invalidateQueries({ queryKey: ['my-actions'] })
      })
      .catch(() => {})
  }, [projectId, targetType, targetId, isLoading, comments.length, queryClient])

  const reactMutation = useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) => toggleReaction(projectId!, commentId, emoji),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Could not add your reaction.'),
  })

  // Everyone on the project can comment - including viewers (the client side
  // of a contract needs a voice) - but never on a completed project.
  const canComment = !!role && !isCompleted

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (body) addMutation.mutate(body)
  }

  return (
    <div className={compact ? '' : 'bg-white rounded-xl border border-slate-200 shadow-card'}>
      {!compact && (
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          {comments.length > 0 && <span className="text-xs text-slate-400">{comments.length}</span>}
        </div>
      )}

      <div className={compact ? 'space-y-4' : 'px-5 py-4 space-y-4'}>
        {isLoading ? (
          <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />)}</div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-400">
            No comments yet. {canComment ? 'Start the conversation below.' : ''}
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-3 group">
              <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-navy-900 font-bold text-xs shrink-0">
                {c.author.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-800">{c.author.name}</p>
                  <span className="text-xs text-slate-400">{format(parseISO(c.createdAt), 'dd MMM yyyy, HH:mm')}</span>
                  {c.visibility === 'MANAGERS_ONLY' && (
                    <span
                      title="Only project admins and commercial managers can see this"
                      className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full"
                    >
                      <Lock className="w-2.5 h-2.5" /> Managers only
                    </span>
                  )}
                  {(c.authorId === me?.id || role === 'ADMIN') && !isCompleted && (
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      title="Delete comment"
                      className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                <ReactionBar comment={c} onToggle={(emoji) => reactMutation.mutate({ commentId: c.id, emoji })} />
              </div>
            </div>
          ))
        )}

        {canComment && (
          <form onSubmit={submit} className="pt-2 space-y-2">
            <div className="flex items-start gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Ctrl/Cmd+Enter posts, matching common chat behaviour
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e as unknown as React.FormEvent)
                }}
                rows={2}
                placeholder="Write a comment…"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green resize-y"
              />
              <Button type="submit" size="sm" icon={<Send className="w-3.5 h-3.5" />} loading={addMutation.isPending} disabled={!draft.trim()}>
                Post
              </Button>
            </div>

            {canRestrict && (
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={restricted}
                  onChange={(e) => setRestricted(e.target.checked)}
                  className="rounded border-slate-300 text-gold-600 focus:ring-gold-500"
                />
                <Lock className="w-3 h-3" />
                Managers only - hide this from Viewer accounts (e.g. commercial or funding matters)
              </label>
            )}
          </form>
        )}

        {isCompleted && (
          <p className="text-xs text-slate-400 pt-1">This project is completed - the discussion is read-only.</p>
        )}
      </div>
    </div>
  )
}
