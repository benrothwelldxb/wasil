import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const newToast = { ...toast, id }
    setToasts(prev => [...prev, newToast])
    const duration = toast.duration ?? (toast.type === 'error' ? 6000 : 4000)
    setTimeout(() => removeToast(id), duration)
  }, [removeToast])

  const success = useCallback((message: string) => addToast({ type: 'success', message }), [addToast])
  const error = useCallback((message: string) => addToast({ type: 'error', message }), [addToast])
  const warning = useCallback((message: string) => addToast({ type: 'warning', message }), [addToast])
  const info = useCallback((message: string) => addToast({ type: 'info', message }), [addToast])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

const TOAST_STYLES = {
  success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', Icon: CheckCircle },
  error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', Icon: AlertCircle },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', Icon: AlertTriangle },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', Icon: Info },
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const style = TOAST_STYLES[toast.type]
  const [isExiting, setIsExiting] = useState(false)

  const handleRemove = () => {
    setIsExiting(true)
    setTimeout(onRemove, 200)
  }

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg ${style.bg} ${style.border} ${style.text} transition-all duration-200 ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}
      role="alert"
    >
      <style.Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button onClick={handleRemove} className="shrink-0 p-0.5 rounded hover:bg-black/5">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={() => onRemove(toast.id)} />
        </div>
      ))}
    </div>
  )
}
