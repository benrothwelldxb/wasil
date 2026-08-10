/**
 * AI output validation (Phase 2).
 *
 * AI-generated wording must remain observational and never override the
 * deterministic safety constraints. This extends the shared forbidden-language
 * list with AI-specific phrasings ("you have…", "this confirms…", dose advice)
 * and is applied to every AI output before it can reach the user. Anything that
 * fails is discarded in favour of the deterministic text.
 */

import { findUnsafeLanguage } from '@/domain/safety/language';

const AI_FORBIDDEN: readonly RegExp[] = [
  /\byou have\b/i,
  /\bthis confirms\b/i,
  /\byou (?:are|might be|may be) (?:suffering|experiencing) (?:from )?[a-z]/i,
  /\byou should (?:start|stop|increase|reduce|change|take)\b/i,
  /\bstart (?:hrt|hormone)/i,
  /\breduce your dose\b/i,
  /\bstop taking\b/i,
  /\bthis is (?:caused by|because of|due to your)\b/i,
];

export interface ValidationResult {
  ok: boolean;
  violations: string[];
}

export function validateAIOutput(text: string): ValidationResult {
  const violations = findUnsafeLanguage(text).map((v) => v.match);
  for (const pattern of AI_FORBIDDEN) {
    const m = text.match(pattern);
    if (m) violations.push(m[0]);
  }
  // Empty or too-short output is also a failure (never show a blank AI screen).
  if (text.trim().length < 12) violations.push('<empty>');
  return { ok: violations.length === 0, violations };
}
