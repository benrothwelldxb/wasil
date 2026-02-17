import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const theme = useTheme()

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: 'text-red-500',
          button: 'bg-red-600 hover:bg-red-700',
        }
      case 'warning':
        return {
          icon: 'text-amber-500',
          button: 'bg-amber-600 hover:bg-amber-700',
        }
      default:
        return {
          icon: 'text-blue-500',
          button: '',
        }
    }
  }

  const styles = getVariantStyles()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        <div className="p-6">
          <div className="flex items-start space-x-4">
            <div className={`flex-shrink-0 ${styles.icon}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50 ${
                variant === 'default' ? '' : styles.button
              }`}
              style={variant === 'default' ? { backgroundColor: theme.colors.brandColor } : undefined}
            >
              {isLoading ? 'Please wait...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
