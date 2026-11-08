import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import prisma from '../../src/services/prisma'
import { recordChildAnswer, removeGuardianAnswers } from '../../src/services/perChildForms'

// Per-child consent against a real Postgres: the advisory lock is valid SQL,
// two guardians answering at once settle to the rule rather than to whichever
// write landed last, and the backfilled shape (one FormResponse per child
// derived from FormGuardianAnswer) holds.

const TAG = 'itest-perchild'
let schoolId = ''
let studentId = ''
let mum = ''
let dad = ''

const YES = { consent: 'Yes' }
const NO = { consent: 'No' }

async function form(consentFieldId: string | null) {
  const f = await prisma.form.create({
    data: {
      title: `${TAG}-form`, type: 'permission-consent', status: 'ACTIVE', fields: [], targetClass: 'Selected pupils',
      schoolId, perChild: true, consentFieldId,
    },
  })
  return f.id
}
const standing = (formId: string) => prisma.formResponse.findUnique({ where: { formId_studentId: { formId, studentId } } })

beforeAll(async () => {
  const school = await prisma.school.create({ data: { name: `${TAG}-school`, shortName: TAG, city: 'Dubai' } })
  schoolId = school.id
  const cls = await prisma.class.create({ data: { name: `${TAG}-4A`, schoolId } })
  const student = await prisma.student.create({ data: { firstName: 'Omar', lastName: 'Haddad', schoolId, classId: cls.id } })
  studentId = student.id
  mum = (await prisma.user.create({ data: { email: `${TAG}-mum@example.com`, name: 'Rania', role: 'PARENT', schoolId } })).id
  dad = (await prisma.user.create({ data: { email: `${TAG}-dad@example.com`, name: 'Karim', role: 'PARENT', schoolId } })).id
})

afterAll(async () => {
  await prisma.form.deleteMany({ where: { schoolId } })
  await prisma.user.deleteMany({ where: { schoolId } })
  await prisma.student.deleteMany({ where: { schoolId } })
  await prisma.class.deleteMany({ where: { schoolId } })
  await prisma.school.deleteMany({ where: { id: schoolId } })
})

describe('per-child answers in Postgres', () => {
  it('one Yes stands on a consent form, whichever parent answered first', async () => {
    const yesFirst = await form('consent')
    await recordChildAnswer({ formId: yesFirst, studentId, userId: mum, answers: YES, consentFieldId: 'consent' })
    await recordChildAnswer({ formId: yesFirst, studentId, userId: dad, answers: NO, consentFieldId: 'consent' })
    expect(await standing(yesFirst)).toMatchObject({ userId: mum, answers: YES })

    const noFirst = await form('consent')
    await recordChildAnswer({ formId: noFirst, studentId, userId: dad, answers: NO, consentFieldId: 'consent' })
    await recordChildAnswer({ formId: noFirst, studentId, userId: mum, answers: YES, consentFieldId: 'consent' })
    expect(await standing(noFirst)).toMatchObject({ userId: mum, answers: YES })
    expect(await prisma.formGuardianAnswer.count({ where: { formId: noFirst } })).toBe(2)
  })

  it('two parents answering at the same moment still settle to the rule', async () => {
    for (let i = 0; i < 5; i++) {
      const f = await form('consent')
      await Promise.all([
        recordChildAnswer({ formId: f, studentId, userId: mum, answers: YES, consentFieldId: 'consent' }),
        recordChildAnswer({ formId: f, studentId, userId: dad, answers: NO, consentFieldId: 'consent' }),
      ])
      expect(await standing(f)).toMatchObject({ userId: mum, answers: YES })
    }
  })

  it('the latest answer stands on a form that is not consent', async () => {
    const f = await form(null)
    await recordChildAnswer({ formId: f, studentId, userId: mum, answers: YES, consentFieldId: null })
    await recordChildAnswer({ formId: f, studentId, userId: dad, answers: NO, consentFieldId: null })
    expect(await standing(f)).toMatchObject({ userId: dad, answers: NO })
  })

  it('removing a guardian re-settles the child on the other guardian\'s answer', async () => {
    const f = await form('consent')
    await recordChildAnswer({ formId: f, studentId, userId: dad, answers: NO, consentFieldId: 'consent' })
    await recordChildAnswer({ formId: f, studentId, userId: mum, answers: YES, consentFieldId: 'consent' })
    await removeGuardianAnswers(mum)
    expect(await standing(f)).toMatchObject({ userId: dad, answers: NO })
  })
})
