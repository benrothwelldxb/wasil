import type { FormField, FormType } from '../types'

export interface FormTemplate {
  key: FormType
  name: string
  description: string
  defaultTitle: string
  fields: FormField[]
}

let fieldCounter = 0
function fieldId(): string {
  return `field_${++fieldCounter}_${Date.now()}`
}

export function createFieldsFromTemplate(type: FormType): FormField[] {
  const template = FORM_TEMPLATES[type]
  if (!template) return []
  // Return deep copies with fresh IDs
  fieldCounter = 0
  return template.fields.map(f => ({ ...f, id: fieldId() }))
}

export const FORM_TEMPLATES: Record<FormType, FormTemplate> = {
  'permission-consent': {
    key: 'permission-consent',
    name: 'Permission / Consent',
    description: 'Collect consent or permission from parents',
    defaultTitle: 'Permission / Consent Form',
    fields: [
      { id: '', type: 'checkbox', label: 'I give my consent', required: true, removable: false },
      { id: '', type: 'textarea', label: 'Additional notes', placeholder: 'Any additional information...', required: false, removable: true },
    ],
  },
  'trip-consent': {
    key: 'trip-consent',
    name: 'Trip Consent',
    description: 'Collect consent and details for school trips',
    defaultTitle: 'Trip Consent Form',
    fields: [
      { id: '', type: 'date', label: 'Trip date', required: true, removable: false },
      { id: '', type: 'checkbox', label: 'I give consent for my child to attend', required: true, removable: false },
      { id: '', type: 'number', label: 'Payment amount (optional)', placeholder: '0.00', required: false, removable: true, validation: { min: 0 } },
      { id: '', type: 'textarea', label: 'Medical notes', placeholder: 'Any medical information we should know...', required: false, removable: true },
    ],
  },
  'payment-request': {
    key: 'payment-request',
    name: 'Payment Request',
    description: 'Request payment from parents',
    defaultTitle: 'Payment Request',
    fields: [
      { id: '', type: 'number', label: 'Amount', placeholder: '0.00', required: true, removable: false, validation: { min: 0 } },
      { id: '', type: 'text', label: 'Reference', placeholder: 'Payment reference...', required: false, removable: true },
    ],
  },
  'medical-info': {
    key: 'medical-info',
    name: 'Medical Information',
    description: 'Collect medical information from parents',
    defaultTitle: 'Medical Information Form',
    fields: [
      { id: '', type: 'textarea', label: 'Medical conditions', placeholder: 'List any medical conditions...', required: false, removable: false },
      { id: '', type: 'textarea', label: 'Allergies', placeholder: 'List any allergies...', required: false, removable: false },
      { id: '', type: 'textarea', label: 'Medications', placeholder: 'List any medications...', required: false, removable: false },
      { id: '', type: 'text', label: 'Emergency contact name & number', placeholder: 'Name — Phone number', required: true, removable: false },
    ],
  },
  'general-info': {
    key: 'general-info',
    name: 'General Information',
    description: 'Collect custom information — add your own fields',
    defaultTitle: 'Information Form',
    fields: [],
  },
  'quick-poll': {
    key: 'quick-poll',
    name: 'Quick Poll',
    description: 'Simple single-choice poll (replaces surveys)',
    defaultTitle: 'Quick Poll',
    fields: [
      { id: '', type: 'select', label: 'Choose an option', required: true, removable: false, options: ['Option 1', 'Option 2'] },
    ],
  },
}
