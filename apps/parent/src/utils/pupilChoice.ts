import type { FormField } from '@wasil/shared'

/**
 * The pupils a parent may choose from in a pupil choice (C14), such as a
 * room-sharing friend: the field's options, leaving out the child being
 * answered for and anyone already chosen in another pupil choice on the form
 * for this child (the server refuses the same pupil twice). The server sends
 * them sorted by label.
 */
export function pupilChoiceOptions(
  field: FormField,
  fields: FormField[],
  answers: Record<string, unknown>,
  answeringForHubId: string | null | undefined,
): Array<{ value: string; label: string }> {
  const takenElsewhere = new Set(
    fields
      .filter(f => f.type === 'pupil_choice' && f.id !== field.id)
      .map(f => answers[f.id])
      .filter((v): v is string => typeof v === 'string' && v !== ''),
  )
  return (field.pupilOptions ?? []).filter(o =>
    o.value !== answeringForHubId && !takenElsewhere.has(o.value),
  )
}
