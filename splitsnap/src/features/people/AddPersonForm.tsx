import { useForm } from 'react-hook-form'
import { UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AddPersonFormProps {
  onAdd: (name: string) => void | Promise<unknown>
  disabled?: boolean
}

interface FormValues {
  name: string
}

/** Small controlled form to add a person by name. */
export function AddPersonForm({ onAdd, disabled }: AddPersonFormProps) {
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: { name: '' },
  })

  const submit = handleSubmit(async ({ name }) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await onAdd(trimmed)
    reset({ name: '' })
  })

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        aria-label="Person's name"
        placeholder="Add a person…"
        autoComplete="off"
        maxLength={40}
        disabled={disabled}
        {...register('name', { required: true, maxLength: 40 })}
      />
      <Button
        type="submit"
        variant="accent"
        className="shrink-0"
        disabled={disabled || formState.isSubmitting}
      >
        <UserPlus />
        Add
      </Button>
    </form>
  )
}
