import React, { useEffect, useRef, useState } from 'react'
import { Bold, Italic, List, ListOrdered, Link2, Eye, PenLine, AtSign } from 'lucide-react'
import { RichText } from '@wasil/shared'

/**
 * A formatting toolbar over a plain textarea, storing markdown.
 *
 * Deliberately not a WYSIWYG/contentEditable editor like
 * `components/forms/RichTextEditor.tsx`: that one emits raw HTML, which then
 * needs sanitising on the way in and `dangerouslySetInnerHTML` on the way out.
 * Markdown is already the convention for message bodies here and in Desk, whose
 * toolbar set (bold / italic / lists) this mirrors, so parent-side rendering
 * stays a restricted allowlist with no HTML path at all.
 *
 * Staff never type syntax — the buttons write it — and Preview shows the
 * genuine parent-side render, not an approximation of it.
 */

export interface MarkdownToolbarEditorProps {
  value: string
  onChange: (next: string) => void
  rows?: number
  required?: boolean
  placeholder?: string
  /** When provided, an @ button appears and calls this to insert a mention. */
  onRequestMention?: (insert: (markdown: string) => void) => void
  /** Renders inside the preview pane, so previews match the parent app exactly. */
  renderLink?: (href: string, children: React.ReactNode) => React.ReactNode
}

export function MarkdownToolbarEditor({
  value,
  onChange,
  rows = 10,
  required,
  placeholder,
  onRequestMention,
  renderLink,
}: MarkdownToolbarEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  // Where the caret should land after a toolbar edit. Applied post-render,
  // because setting state blows away the textarea's own selection.
  const pendingSel = useRef<[number, number] | null>(null)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (!pendingSel.current || !taRef.current || preview) return
    const [start, end] = pendingSel.current
    pendingSel.current = null
    taRef.current.focus()
    taRef.current.setSelectionRange(start, end)
  })

  const splice = (from: number, to: number, text: string, selStart: number, selEnd: number) => {
    onChange(value.slice(0, from) + text + value.slice(to))
    pendingSel.current = [selStart, selEnd]
  }

  /** Wrap the selection in `marker`, or unwrap it if it's already wrapped. */
  const wrap = (marker: string) => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const selected = value.slice(s, e)
    const len = marker.length

    if (selected && value.slice(s - len, s) === marker && value.slice(e, e + len) === marker) {
      splice(s - len, e + len, selected, s - len, e - len)
      return
    }
    if (!selected) {
      // No selection: drop in the markers and park the caret between them.
      splice(s, e, marker + marker, s + len, s + len)
      return
    }
    splice(s, e, marker + selected + marker, s + len, e + len)
  }

  /** Toggle a list prefix across every line the selection touches. */
  const listify = (ordered: boolean) => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const from = value.lastIndexOf('\n', s - 1) + 1
    const nextBreak = value.indexOf('\n', e)
    const to = nextBreak === -1 ? value.length : nextBreak

    const lines = value.slice(from, to).split('\n')
    const marker = /^[ \t]*([-*+]|\d+\.)[ \t]+/
    const allMarked = lines.every(l => l.trim() === '' || marker.test(l))

    const out = lines
      .map((l, i) => {
        if (allMarked) return l.replace(marker, '')
        if (l.trim() === '') return l
        return (ordered ? `${i + 1}. ` : '- ') + l
      })
      .join('\n')

    splice(from, to, out, from, from + out.length)
  }

  // The link button opens a small form for the address and the words to show.
  // It used to drop in `[link text](https://)`, and unless that placeholder
  // was typed over, parents saw the words "link text".
  const [linkForm, setLinkForm] = useState<{ from: number; to: number; label: string; url: string } | null>(null)

  const openLinkForm = () => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const selected = value.slice(s, e)
    // A selected address is the link itself; selected words are its label.
    const looksLikeUrl = /^(https?:\/\/|www\.)\S+$/i.test(selected.trim())
    setLinkForm({ from: s, to: e, label: looksLikeUrl ? '' : selected, url: looksLikeUrl ? selected.trim() : '' })
  }

  const insertLink = () => {
    if (!linkForm) return
    const url = normaliseLinkUrl(linkForm.url)
    if (!url) return
    const label = linkForm.label.trim().replace(/[[\]]/g, '') || url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
    const text = `[${label}](${url})`
    const caret = linkForm.from + text.length
    setLinkForm(null)
    splice(linkForm.from, linkForm.to, text, caret, caret)
  }

  /** Used by the mention picker to drop its markdown at the caret. */
  const insertAtCaret = (markdown: string) => {
    const ta = taRef.current
    const s = ta ? ta.selectionStart : value.length
    const e = ta ? ta.selectionEnd : value.length
    const caret = s + markdown.length
    splice(s, e, markdown, caret, caret)
  }

  const btn =
    'p-1.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-slate-50 border-b border-slate-200">
        <button type="button" onClick={() => wrap('**')} disabled={preview} className={btn} title="Bold">
          <Bold className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => wrap('*')} disabled={preview} className={btn} title="Italic">
          <Italic className="w-4 h-4" />
        </button>
        <span className="w-px h-5 bg-slate-300 mx-1" />
        <button type="button" onClick={() => listify(false)} disabled={preview} className={btn} title="Bulleted list">
          <List className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => listify(true)} disabled={preview} className={btn} title="Numbered list">
          <ListOrdered className="w-4 h-4" />
        </button>
        <button type="button" onClick={openLinkForm} disabled={preview} className={btn} title="Link">
          <Link2 className="w-4 h-4" />
        </button>
        {onRequestMention && (
          <>
            <span className="w-px h-5 bg-slate-300 mx-1" />
            <button
              type="button"
              onClick={() => onRequestMention(insertAtCaret)}
              disabled={preview}
              className={btn}
              title="Tag a staff member"
            >
              <AtSign className="w-4 h-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setPreview(p => !p)}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-200"
        >
          {preview ? <PenLine className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {linkForm && !preview && (
        <div className="flex flex-wrap items-center gap-2 px-2 py-2 bg-slate-50 border-b border-slate-200">
          <input
            autoFocus
            type="url"
            inputMode="url"
            value={linkForm.url}
            onChange={e => setLinkForm({ ...linkForm, url: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); insertLink() }
              if (e.key === 'Escape') setLinkForm(null)
            }}
            placeholder="Web address, e.g. https://example.com"
            className="flex-1 min-w-[12rem] px-2 py-1 text-sm border border-slate-300 rounded"
          />
          <input
            type="text"
            value={linkForm.label}
            onChange={e => setLinkForm({ ...linkForm, label: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); insertLink() }
              if (e.key === 'Escape') setLinkForm(null)
            }}
            placeholder="Words to show (optional)"
            className="flex-1 min-w-[10rem] px-2 py-1 text-sm border border-slate-300 rounded"
          />
          <button
            type="button"
            onClick={insertLink}
            disabled={!normaliseLinkUrl(linkForm.url)}
            className="px-3 py-1 text-xs font-medium rounded bg-blue-600 text-white disabled:opacity-40"
          >
            Add link
          </button>
          <button type="button" onClick={() => setLinkForm(null)} className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded">
            Cancel
          </button>
        </div>
      )}

      {preview ? (
        <div className="px-3 py-2 min-h-[10rem] text-sm text-slate-800 bg-white">
          {value.trim() ? (
            <RichText content={value} renderLink={renderLink} />
          ) : (
            <p className="text-slate-400">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm focus:outline-none resize-y"
          rows={rows}
          required={required}
          placeholder={placeholder}
        />
      )}
    </div>
  )
}

/** A typed address as a link target: `www.x.com` and `x.com/page` get
 *  https:// added; mailto: and tel: are kept. Empty if it is not an address. */
export function normaliseLinkUrl(input: string): string {
  const raw = input.trim()
  if (!raw || /\s/.test(raw)) return ''
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return /^https?:\/\/$/i.test(raw) ? '' : raw
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(raw)) return `https://${raw}`
  return ''
}
