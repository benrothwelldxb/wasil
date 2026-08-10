/**
 * Health-language safety.
 *
 * elowa describes what the user recorded — it never diagnoses, never claims
 * causation, and never gives treatment advice. All generated insight copy is
 * built from the templates below, and `findUnsafeLanguage` is used in tests to
 * guarantee no forbidden phrasing slips into generated text.
 */

/** Phrases elowa must never generate in insight/summary copy. */
export const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bcaus(e|es|ed|ing)\b/i,
  /\bprov(e|es|en|ing)\b/i,
  /\bdefinitely\b/i,
  /\bdiagnos(e|es|ed|is|ing)\b/i,
  /\bguarantee\b/i,
  /\bcure(s|d)?\b/i,
  /you(?:'re| are) (?:probably |likely )?perimenopausal/i,
  /(?:low|high|falling|rising)\s+(?:o?estrogen|oestrogen|progesterone|hormones?)/i,
  /(?:o?estrogen|oestrogen|progesterone|hormone)\s+(?:is|are|levels?)/i,
  /\b(?:increase|decrease|raise|lower|adjust|stop|start|change)\s+(?:your\s+)?(?:dose|dosage|medication|hrt|treatment)/i,
  /you should (?:increase|decrease|stop|start|change|take)/i,
  /\bis (?:definitely |clearly )?hormonal\b/i,
];

export interface SafetyViolation {
  pattern: string;
  match: string;
}

/** Returns any forbidden phrases found in `text` (empty array = safe). */
export function findUnsafeLanguage(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    const m = text.match(pattern);
    if (m) violations.push({ pattern: pattern.source, match: m[0] });
  }
  return violations;
}

export function isSafeCopy(text: string): boolean {
  return findUnsafeLanguage(text).length === 0;
}

// ---------------------------------------------------------------------------
// Cautious copy templates (the only place health-adjacent sentences are built)
// ---------------------------------------------------------------------------

const lower = (s: string) => s.toLowerCase();

export const safeCopy = {
  changeWorse(label: string, windowLabel = 'this week'): { title: string; body: string } {
    return {
      title: `Your ${lower(label)} has been more disrupted than usual ${windowLabel}.`,
      body: 'This is based on your recent check-ins compared with your usual range.',
    };
  },
  improvement(label: string, windowLabel = 'the past two weeks'): { title: string; body: string } {
    return {
      title: `Your ${lower(label)} has been closer to your usual range over ${windowLabel}.`,
      body: 'Recent check-ins have sat nearer the levels you usually record.',
    };
  },
  frequency(label: string, days: number, total: number): { title: string; body: string } {
    return {
      title: `${label} has been worse than usual on ${days} of the past ${total} days.`,
      body: 'A count of the days you recorded this above your usual range recently.',
    };
  },
  cooccurrence(a: string, b: string): { title: string; body: string } {
    return {
      title: `Worse-than-usual ${lower(a)} and worse-than-usual ${lower(b)} have tended to appear on the same days.`,
      body: 'These tended to occur together in your data. This is an association, not a reason.',
    };
  },
  sequence(a: string, b: string): { title: string; body: string } {
    return {
      title: `Worse-than-usual ${lower(b)} has often appeared the day after days you marked ${lower(a)} higher.`,
      body: 'This describes a pattern in the order of your entries, not a reason for it.',
    };
  },
  sleepChange(shorter: boolean, windowLabel = 'this week'): { title: string; body: string } {
    return {
      title: shorter
        ? `Your recorded sleep has been shorter than usual ${windowLabel}.`
        : `Your recorded sleep has been closer to your usual range ${windowLabel}.`,
      body: 'Based on the passive sleep data you connected, compared with your usual range.',
    };
  },
  contextSleep(tagLabel: string): { title: string; body: string } {
    return {
      title: `Sleep has more often been shorter than usual on days you tagged ${lower(tagLabel)}.`,
      body: 'These tended to occur together in your data. This is an association, not a reason.',
    };
  },
  activityMood(): { title: string; body: string } {
    return {
      title: 'On days with more movement, you have more often recorded better-than-usual mood.',
      body: 'These tended to occur together in your data. This is an association, not a reason.',
    };
  },
  treatmentObservation(
    symptomLabel: string,
    treatmentTitle: string,
    dateLabel: string,
    direction: 'less' | 'more',
  ): { title: string; body: string } {
    return {
      title: `${symptomLabel} has been logged ${direction} often since your ${lower(treatmentTitle)} on ${dateLabel}.`,
      body: 'This is an observed association around the same time. It does not establish that one led to the other — worth discussing with a healthcare professional.',
    };
  },
} as const;

/** Standard "why am I seeing this?" evidence sentence. */
export function explanation(recentText: string, comparisonText: string): string {
  return `${recentText}, compared with ${comparisonText}.`;
}

/**
 * Reusable "What this means" note. Association findings always carry the
 * explicit "cannot determine cause" caveat.
 */
export const whatThisMeans = {
  association:
    'These two things have often occurred together in your recent data. elowa cannot determine whether one leads to the other.',
  change:
    'This compares your recent check-ins with your own usual range. It describes what you recorded, not the reason for it.',
  treatment:
    'This changed around the same time. elowa cannot determine whether the treatment led to the change — it is worth discussing with a healthcare professional.',
  cycle: 'A record of your cycle history. Changes in cycle length are common during perimenopause.',
} as const;

/** A cautious, standard reminder used across insight surfaces. */
export const DISCLAIMER =
  'elowa describes patterns in what you record. It does not diagnose conditions or give medical advice.';
