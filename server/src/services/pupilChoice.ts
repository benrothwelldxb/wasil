// A partner form's "pupil choice" field (C14): a parent picks one of a list of
// pupils, such as a room-sharing friend on a residential trip.
//
// The partner publishes the list as Hub pupil ids (`pupilHubIds`) and reads the
// answer back as a Hub pupil id. Connect turns the ids into names only for the
// parent's drop-down ("Jade W.") and for the school's own admin views. An id
// with no Connect pupil behind it is allowed on publish and simply never
// offered, and is refused as an answer.
//
// The list may change after answers exist (children join and leave trips); an
// answer stays as it was stored.
import prisma from './prisma.js'

export const PUPIL_CHOICE = 'pupil_choice'

type AnyField = { id: string; type?: string; partnerType?: string; pupilHubIds?: unknown }

export interface PupilOption {
  /** The Hub pupil id: what is sent back as the answer. */
  value: string
  /** First name and last-name initial, e.g. "Jade W.". */
  label: string
}

export function isPupilChoice(f: AnyField | null | undefined): boolean {
  return !!f && (f.partnerType === PUPIL_CHOICE || f.type === PUPIL_CHOICE)
}

function idsOf(f: AnyField): string[] {
  return Array.isArray(f.pupilHubIds) ? f.pupilHubIds.filter((x): x is string => typeof x === 'string') : []
}

/** "Jade W.": the first name and the initial of the last name. Connect holds
 *  no preferred name for a pupil, so the first name is the registered one. */
export function pupilChoiceLabel(firstName: string, lastName: string): string {
  const first = (firstName || '').trim()
  const initial = Array.from((lastName || '').trim())[0]
  return initial ? `${first} ${initial.toUpperCase()}.` : first
}

/** The school's pupils behind these Hub ids, keyed by Hub id. */
async function pupilsByHubId(schoolId: string, hubIds: string[]) {
  const out = new Map<string, { id: string; firstName: string; lastName: string }>()
  const unique = [...new Set(hubIds)]
  if (unique.length === 0) return out
  const rows = await prisma.student.findMany({
    where: { schoolId, hubPupilId: { in: unique } },
    select: { id: true, firstName: true, lastName: true, hubPupilId: true },
  })
  for (const r of rows) if (r.hubPupilId) out.set(r.hubPupilId, r)
  return out
}

/**
 * The fields as a parent's app receives them: each pupil choice carries
 * `pupilOptions` (known pupils only, sorted by label) in place of its Hub ids.
 * The app leaves out the child being answered for. Forms with no pupil choice
 * are returned untouched, with no query.
 */
export async function fieldsForParent<F extends AnyField>(schoolId: string, fields: F[]): Promise<F[]> {
  const choices = (Array.isArray(fields) ? fields : []).filter(isPupilChoice)
  if (choices.length === 0) return fields
  const pupils = await pupilsByHubId(schoolId, choices.flatMap(idsOf))
  return fields.map(f => {
    if (!isPupilChoice(f)) return f
    const { pupilHubIds: _ids, ...rest } = f
    const pupilOptions: PupilOption[] = idsOf(f)
      .filter(id => pupils.has(id))
      .map(id => ({ value: id, label: pupilChoiceLabel(pupils.get(id)!.firstName, pupils.get(id)!.lastName) }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value))
    return { ...rest, pupilOptions } as unknown as F
  })
}

/** Per form, the parent-facing fields of every form among these that has a
 *  pupil choice. Forms without one are absent from the map. */
export async function parentFieldsByForm(
  forms: Array<{ id: string; schoolId: string; fields: unknown }>,
): Promise<Map<string, unknown[]>> {
  const out = new Map<string, unknown[]>()
  const seen = new Set<string>()
  for (const form of forms) {
    if (seen.has(form.id)) continue
    seen.add(form.id)
    const fields = Array.isArray(form.fields) ? (form.fields as AnyField[]) : []
    if (!fields.some(isPupilChoice)) continue
    out.set(form.id, await fieldsForParent(form.schoolId, fields))
  }
  return out
}

export type PupilChoiceCheck =
  | { ok: true; answers: Record<string, unknown> }
  | { ok: false; error: string; field: string; message: string }

/**
 * Check a parent's answers to a form's pupil choices, for one child.
 *
 * Each chosen value must be one of the field's `pupilHubIds`, a pupil Connect
 * knows in the school, and not the child being answered for. The same pupil
 * may not be chosen in two of the form's pupil choices for one child. An empty
 * answer ('' or null) is dropped, so it reads back as absent.
 */
export async function checkPupilChoices(
  schoolId: string,
  fields: AnyField[],
  answers: Record<string, unknown>,
  studentId: string | null | undefined,
): Promise<PupilChoiceCheck> {
  const choices = (Array.isArray(fields) ? fields : []).filter(isPupilChoice)
  if (choices.length === 0) return { ok: true, answers }
  const out = { ...answers }
  const chosen: Array<{ field: AnyField; value: string }> = []
  for (const f of choices) {
    const v = out[f.id]
    if (v === undefined) continue
    if (v === '' || v === null) { delete out[f.id]; continue }
    if (typeof v !== 'string' || !idsOf(f).includes(v)) {
      return { ok: false, error: 'invalid_choice', field: f.id, message: 'That pupil is not one of the choices' }
    }
    chosen.push({ field: f, value: v })
  }
  if (chosen.length === 0) return { ok: true, answers: out }

  const pupils = await pupilsByHubId(schoolId, chosen.map(c => c.value))
  const used = new Set<string>()
  for (const { field, value } of chosen) {
    const pupil = pupils.get(value)
    if (!pupil) return { ok: false, error: 'invalid_choice', field: field.id, message: 'That pupil is not one of the choices' }
    if (studentId && pupil.id === studentId) {
      return { ok: false, error: 'invalid_choice', field: field.id, message: 'Choose someone other than the child you are answering for' }
    }
    if (used.has(value)) {
      return { ok: false, error: 'duplicate_choice', field: field.id, message: 'The same pupil is chosen twice' }
    }
    used.add(value)
  }
  return { ok: true, answers: out }
}

/** Full names of the pupils chosen in a form's answers, keyed by Hub id: for
 *  the school's admin views and exports, never for a parent. */
export async function chosenPupilNames(
  schoolId: string,
  fields: unknown,
  answerSets: unknown[],
): Promise<Record<string, string>> {
  const choices = (Array.isArray(fields) ? (fields as AnyField[]) : []).filter(isPupilChoice)
  if (choices.length === 0) return {}
  const ids: string[] = []
  for (const a of answerSets) {
    const given = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
    for (const f of choices) if (typeof given[f.id] === 'string' && given[f.id]) ids.push(given[f.id] as string)
  }
  const pupils = await pupilsByHubId(schoolId, ids)
  const out: Record<string, string> = {}
  for (const [hubId, p] of pupils) out[hubId] = `${p.firstName} ${p.lastName}`.trim()
  return out
}
