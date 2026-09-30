// Ready-made pulse surveys for the points in a year a school actually asks
// something.
//
// Choosing questions per survey shipped first, and it is the mechanism; this is
// the shortcut. Rebuilding a question list every term is a minute's ticking for
// a principal who knows what they want, and a blank form for anyone else — a
// named template is also how a school says "this is the one we send in
// September" to whoever sends it next year.
//
// DEFINED IN CODE, NOT SEEDED PER SCHOOL. A seeded row is a copy that rots:
// improve the wording and every school that adopted early keeps the old one,
// and a school that deletes one by accident cannot get it back. These are
// starting points, not records — applying one fills the form and the survey it
// creates is an ordinary survey with no link back.
//
// EVERY TEMPLATE KEEPS THE FREE-TEXT QUESTION. It is the one that produces
// something to act on, and the only one whose answers a school reads rather
// than counts.
//
// Most keep at least one ANCHOR — belonging, quality or overall satisfaction —
// because the trend comparison matches questions across surveys by key. A
// template that drops them all gives a clean survey and a broken trend line.

export interface PulseTemplateQuestion {
  text: string
  type: 'LIKERT_5' | 'TEXT_OPTIONAL'
}

export interface PulseTemplate {
  key: string
  name: string
  /** What it is for, in the words a school would use. Shown beside the name. */
  blurb: string
  coreQuestionKeys: string[]
  /** Suggested wording. Every one is a guess at what this school would ask and
   *  is fully editable once applied — a template that cannot be changed is a
   *  form, not a starting point. */
  customQuestions: PulseTemplateQuestion[]
  /** A preset additional question, where one of the existing eight fits. */
  additionalQuestionKey?: string
  /** GROUP and YEAR_GROUPS carry no id: the template knows the SHAPE of the
   *  audience, never which group. The form then asks, rather than defaulting
   *  to one and sending a new-parents survey to the PTA. */
  audienceType: 'SCHOOL' | 'GROUP' | 'YEAR_GROUPS'
}

const CORE = {
  quality: 'core_quality',
  belonging: 'core_belonging',
  communication: 'core_communication',
  responsiveness: 'core_responsiveness',
  expectations: 'core_expectations',
  satisfaction: 'core_overall_satisfaction',
  freeText: 'core_improve_now',
}

export const PULSE_TEMPLATES: PulseTemplate[] = [
  {
    key: 'full_termly',
    name: 'Full termly pulse',
    blurb: 'All seven questions, to everyone. The baseline you compare the others against.',
    coreQuestionKeys: Object.values(CORE),
    customQuestions: [],
    audienceType: 'SCHOOL',
  },
  {
    key: 'start_of_year',
    name: 'Start of the year',
    blurb: 'Settling in, and whether the first few weeks have been clear. Short on purpose.',
    coreQuestionKeys: [CORE.belonging, CORE.communication, CORE.expectations, CORE.freeText],
    customQuestions: [
      { text: 'My child has settled well into their new class.', type: 'LIKERT_5' },
    ],
    audienceType: 'SCHOOL',
  },
  {
    key: 'new_families',
    name: 'New families',
    blurb: 'For families who have just joined. Ask while joining is still fresh enough to remember.',
    coreQuestionKeys: [CORE.belonging, CORE.communication, CORE.responsiveness, CORE.freeText],
    customQuestions: [
      { text: 'Joining the school was well organised.', type: 'LIKERT_5' },
      { text: 'I know where to find things when I need them.', type: 'LIKERT_5' },
    ],
    // Depends on a group the school keeps current. If that group is empty this
    // reaches nobody — which the audience code refuses rather than widening.
    audienceType: 'GROUP',
  },
  {
    key: 'mid_year',
    name: 'Mid-year check',
    blurb: 'Four questions, all trend anchors. Enough to see movement, short enough to be answered.',
    coreQuestionKeys: [CORE.quality, CORE.belonging, CORE.satisfaction, CORE.freeText],
    customQuestions: [],
    audienceType: 'SCHOOL',
  },
  {
    key: 'end_of_year',
    name: 'End of year',
    blurb: 'The reflective one. Anchors plus how well the school reported on progress.',
    coreQuestionKeys: [CORE.quality, CORE.belonging, CORE.satisfaction, CORE.freeText],
    customQuestions: [],
    additionalQuestionKey: 'opt_feedback',
    audienceType: 'SCHOOL',
  },
  {
    key: 'moving_on',
    name: 'Moving on',
    blurb: 'For a leaving year group and the transition work done with them.',
    coreQuestionKeys: [CORE.belonging, CORE.communication, CORE.freeText],
    customQuestions: [
      { text: 'My child feels prepared for their next school.', type: 'LIKERT_5' },
    ],
    audienceType: 'YEAR_GROUPS',
  },
  {
    key: 'did_that_work',
    name: 'Did that work?',
    blurb:
      'After a change — a new pick-up arrangement, a new timetable. One question about the thing you changed, plus the open box.',
    // Deliberately almost empty. This is the one most likely to be answered and
    // the one that breaks trend comparison entirely: the right trade for a
    // two-week follow-up, the wrong one for anything tracked over years.
    coreQuestionKeys: [CORE.freeText],
    customQuestions: [
      { text: 'The new arrangement works for our family.', type: 'LIKERT_5' },
    ],
    audienceType: 'SCHOOL',
  },
]
