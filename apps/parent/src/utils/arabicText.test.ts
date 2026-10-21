import { describe, it, expect } from 'vitest'
import type { FormField } from '@wasil/shared'
import { readsArabic, fieldLabel, optionLabel } from './arabicText'

/**
 * Arabic on a consent form: the author's own words for a parent reading in
 * Arabic, and the answer recorded in English whatever language it was given
 * in, so the school's record reads the same for every family.
 */

const field: FormField = {
  id: 'home', type: 'select', label: 'Going home', labelAr: 'العودة إلى المنزل',
  required: true, removable: false, options: ['Coach', 'Collected'], optionsAr: ['الحافلة', 'الاستلام'],
}

describe('readsArabic', () => {
  it('follows the parent\'s language, including regional forms', () => {
    expect(readsArabic('ar')).toBe(true)
    expect(readsArabic('ar-AE')).toBe(true)
    expect(readsArabic('en')).toBe(false)
    expect(readsArabic(undefined)).toBe(false)
  })
})

describe('labels and options', () => {
  it('shows the author\'s Arabic to a parent reading in Arabic', () => {
    expect(fieldLabel(field, true)).toBe('العودة إلى المنزل')
    expect(optionLabel(field, 'Collected', true)).toBe('الاستلام')
  })

  it('shows the English to everyone else', () => {
    expect(fieldLabel(field, false)).toBe('Going home')
    expect(optionLabel(field, 'Collected', false)).toBe('Collected')
  })

  it('falls back to the English where the author wrote no Arabic', () => {
    const plain: FormField = { ...field, labelAr: undefined, optionsAr: undefined }
    expect(fieldLabel(plain, true)).toBe('Going home')
    expect(optionLabel(plain, 'Coach', true)).toBe('Coach')
  })
})
