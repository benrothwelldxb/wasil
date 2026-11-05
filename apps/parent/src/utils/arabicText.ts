import type { FormField } from '@wasil/shared'

/**
 * What a parent reading in Arabic sees on a post and its form.
 *
 * The server already sends a post's title and body in the parent's language:
 * the author's own Arabic where they wrote some, otherwise a machine
 * translation. What it cannot do is lay the text out right to left, and form
 * field labels are not machine-translated at all, so an author's labelAr and
 * optionsAr are chosen here.
 */
export function readsArabic(language: string | null | undefined): boolean {
  return (language || '').toLowerCase().startsWith('ar')
}

export function fieldLabel(field: FormField, arabic: boolean): string {
  return arabic && field.labelAr ? field.labelAr : field.label
}

/** What is SHOWN for an option. The answer stays the English option, so an
 *  answer reads the same whichever language it was given in. */
export function optionLabel(field: FormField, option: string, arabic: boolean): string {
  if (!arabic || !field.optionsAr) return option
  const i = (field.options || []).indexOf(option)
  return (i >= 0 && field.optionsAr[i]) || option
}
