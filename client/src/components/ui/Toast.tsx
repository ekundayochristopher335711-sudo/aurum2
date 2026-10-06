import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: ToastKind; message: string }

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {})

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const push = useContext(ToastContext)
  return {
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  }
}

const kindStyles: Record<ToastKind, { bar: string; icon: React.ReactNode }> = {
  success: { bar: 'bg-emerald-500', icon: <CheckCircle className="w-4 h-4 text-emerald-500" /> },
  error: { bar: 'bg-red-500', icon: <AlertCircle className="w-4 h-4 text-red-500" /> },
  info: { bar: 'bg-sky-500', icon: <Info className="w-4 h-4 text-sky-500" /> },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 bg-white rounded-xl shadow-card-lg border border-slate-100 pl-0 pr-3 py-3 overflow-hidden animate-[toastIn_.2s_ease-out]"
          >
            <div className={`w-1 self-stretch shrink-0 rounded-full ml-0 ${kindStyles[t.kind].bar}`} />
            <span className="shrink-0">{kindStyles[t.kind].icon}</span>
            <p className="text-sm text-slate-700 flex-1 leading-snug">{t.message}</p>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
