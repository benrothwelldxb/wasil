import React, { useRef, useEffect, useCallback } from 'react'
import { Bold, Italic, Underline, List, ListOrdered, Minus } from 'lucide-react'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
}

interface ToolbarButton {
  icon: React.ElementType
  command: string
  arg?: string
  label: string
}

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { icon: Bold, command: 'bold', label: 'Bold' },
  { icon: Italic, command: 'italic', label: 'Italic' },
  { icon: Underline, command: 'underline', label: 'Underline' },
  { icon: List, command: 'insertUnorderedList', label: 'Bullet list' },
  { icon: ListOrdered, command: 'insertOrderedList', label: 'Numbered list' },
  { icon: Minus, command: 'insertHorizontalRule', label: 'Divider' },
]

export function RichTextEditor({ value, onChange, placeholder = 'Write your content...', minHeight = '160px' }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalChange = useRef(false)

  // Sync external value into editor (only on mount or if value is reset to empty)
  useEffect(() => {
    if (!editorRef.current) return
    if (isInternalChange.current) {
      isInternalChange.current = false
      return
    }
    // Only overwrite if the value is substantially different (avoids cursor jump)
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  const handleInput = useCallback(() => {
    if (!editorRef.current) return
    isInternalChange.current = true
    onChange(editorRef.current.innerHTML)
  }, [onChange])

  const execCommand = (command: string, arg?: string) => {
    document.execCommand(command, false, arg)
    editorRef.current?.focus()
    handleInput()
  }

  const isActive = (command: string) => {
    try {
      return document.queryCommandState(command)
    } catch {
      return false
    }
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        {TOOLBAR_BUTTONS.map(btn => {
          const Icon = btn.icon
          return (
            <button
              key={btn.command}
              type="button"
              onClick={() => execCommand(btn.command, btn.arg)}
              className="p-1.5 rounded hover:bg-gray-200 transition-colors"
              style={{
                backgroundColor: isActive(btn.command) ? '#E2E8F0' : undefined,
                color: isActive(btn.command) ? '#1E293B' : '#64748B',
              }}
              title={btn.label}
            >
              <Icon className="w-4 h-4" />
            </button>
          )
        })}
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="px-3 py-2 outline-none text-sm leading-relaxed"
        style={{
          minHeight,
          color: '#1E293B',
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      <style>{`
        [contentEditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #94A3B8;
          pointer-events: none;
        }
        [contentEditable] ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        [contentEditable] ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        [contentEditable] hr { border: none; border-top: 1px solid #E2E8F0; margin: 0.75em 0; }
      `}</style>
    </div>
  )
}
