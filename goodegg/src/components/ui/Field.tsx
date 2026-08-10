import { forwardRef, useId, useState } from 'react'
import { cn } from '@/lib/cn'
import { Chip } from './Chip'

const fieldBase =
  'w-full rounded-2xl bg-white border-2 border-transparent px-4 py-3 text-ink placeholder:text-ink-faint shadow-card focus:border-lilac-soft focus:outline-none focus-visible:ring-0'

interface LabelWrapProps {
  label?: string
  hint?: string
  htmlFor: string
  children: React.ReactNode
  optional?: boolean
}

function LabelWrap({ label, hint, htmlFor, children, optional }: LabelWrapProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-semibold text-ink">
          <span>{label}</span>
          {optional && <span className="text-xs font-normal text-ink-muted">optional</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export interface TextInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  optional?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, optional, className, id, ...props },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <LabelWrap label={label} hint={hint} htmlFor={fieldId} optional={optional}>
      <input ref={ref} id={fieldId} className={cn(fieldBase, className)} {...props} />
    </LabelWrap>
  )
})

export interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  optional?: boolean
  maxLength?: number
  showCount?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, optional, className, id, maxLength, showCount, value, ...props },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const count = typeof value === 'string' ? value.length : 0
  return (
    <LabelWrap label={label} hint={hint} htmlFor={fieldId} optional={optional}>
      <div className="relative">
        <textarea
          ref={ref}
          id={fieldId}
          value={value}
          maxLength={maxLength}
          className={cn(fieldBase, 'min-h-[96px] resize-y', className)}
          {...props}
        />
        {showCount && maxLength && (
          <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-ink-faint">
            {count}/{maxLength}
          </span>
        )}
      </div>
    </LabelWrap>
  )
})

interface ChipInputProps {
  label?: string
  hint?: string
  optional?: boolean
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  suggestions?: string[]
}

/** Free-text tags with optional quick-add suggestions. Always allows typing. */
export function ChipInput({
  label,
  hint,
  optional,
  values,
  onChange,
  placeholder = 'Type and press Enter',
  suggestions = [],
}: ChipInputProps) {
  const [draft, setDraft] = useState('')
  const fieldId = useId()

  function add(v: string) {
    const val = v.trim()
    if (val && !values.some((x) => x.toLowerCase() === val.toLowerCase())) {
      onChange([...values, val])
    }
    setDraft('')
  }
  function remove(v: string) {
    onChange(values.filter((x) => x !== v))
  }

  const openSuggestions = suggestions.filter((s) => !values.includes(s))

  return (
    <LabelWrap label={label} hint={hint} htmlFor={fieldId} optional={optional}>
      <div className={cn(fieldBase, 'flex flex-wrap gap-2 py-2.5')}>
        {values.map((v) => (
          <Chip key={v} as="span" label={v} onRemove={() => remove(v)} selected />
        ))}
        <input
          id={fieldId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && values.length) {
              remove(values[values.length - 1]!)
            }
          }}
          placeholder={values.length ? '' : placeholder}
          className="min-w-[8ch] flex-1 bg-transparent text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>
      {openSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {openSuggestions.map((s) => (
            <Chip key={s} label={`+ ${s}`} onToggle={() => add(s)} />
          ))}
        </div>
      )}
    </LabelWrap>
  )
}
