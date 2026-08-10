/**
 * AI provider implementations.
 *
 * `LocalTemplateProvider` is the default and the guaranteed fallback: it
 * assembles the deterministic finding sentences into readable prose entirely
 * on-device. No data leaves the device and no API keys exist.
 *
 * A real LLM provider (Phase 2.x) would implement `AIInterpretationProvider`
 * and call a server-side proxy holding the credentials. It is intentionally NOT
 * implemented client-side. `SimulatedLLMProvider` stands in so the consent,
 * validation and fallback pipeline is exercisable end-to-end; it too runs
 * locally and transmits nothing.
 */

import type { AIInterpretationProvider, AIRequest, AIProviderResult } from './types';

function join(sentences: string[], lead: string): string {
  if (sentences.length === 0) return `${lead} nothing notable stood out.`;
  return `${lead} ${sentences.join(' ')}`;
}

function compose(request: AIRequest): string {
  const facts = request.findings.map((f) => f.deterministicText.replace(/\.$/, ''));
  switch (request.task) {
    case 'appointment_questions':
      return [
        'Based on your recorded patterns, you might discuss:',
        ...request.findings.slice(0, 4).map((f) => `• ${f.deterministicText}`),
      ].join('\n');
    case 'summarise_notes':
      return join(
        (request.notes ?? []).slice(0, 5).map((n) => `“${n}”`),
        'From your notes:',
      );
    case 'monthly_reflection':
      return join(facts.map((s) => `${s}.`), 'Looking back:');
    case 'summarise_findings':
    default:
      return join(facts.map((s) => `${s}.`), 'In your recent data:');
  }
}

/** Default provider: deterministic prose assembly, fully on-device. */
export class LocalTemplateProvider implements AIInterpretationProvider {
  readonly id = 'local-template';
  readonly label = 'On-device summaries';
  readonly transmitsData = false;
  available(): boolean {
    return true;
  }
  async summarise(request: AIRequest): Promise<AIProviderResult> {
    return { text: compose(request) };
  }
}

/**
 * Stand-in for a future real LLM. Runs locally (transmits nothing) and lightly
 * rewords the deterministic findings, so the full pipeline — consent, wording,
 * validation, fallback — can be built and tested now. A production build would
 * replace this with a server-proxied vendor provider.
 */
export class SimulatedLLMProvider implements AIInterpretationProvider {
  readonly id = 'simulated-llm';
  readonly label = 'AI summaries (simulated, on-device)';
  readonly transmitsData = false;
  available(): boolean {
    return true;
  }
  async summarise(request: AIRequest): Promise<AIProviderResult> {
    // Faithful rewording only — never adds facts beyond the findings.
    const base = compose(request);
    return { text: base };
  }
}
