/**
 * The AI interpretation pipeline (Phase 2).
 *
 *   user data → deterministic analysis → structured findings → safety filtering
 *   → AI wording/synthesis → output validation → user
 *
 * The pipeline NEVER bypasses these steps. Without consent (or on any failure)
 * it returns the deterministic text, so the app always works without AI.
 */

import type { AISummary, Insight, StructuredFinding } from '@/domain/models';
import type { AIInterpretationProvider, AIRequest, AITask } from './types';
import { LocalTemplateProvider } from './providers';
import { validateAIOutput } from './validation';

/** Turn ranked insights into structured findings, honouring AI exclusions. */
export function toStructuredFindings(
  insights: readonly Insight[],
  opts: { excludeKeys?: ReadonlySet<string> } = {},
): StructuredFinding[] {
  return insights
    .filter((i) => !(i.relatedMeasureKeys ?? []).some((k) => opts.excludeKeys?.has(k)))
    .map((i) => ({
      id: i.id,
      kind: i.kind,
      strength: i.strength,
      facts: {
        title: i.title,
        evidenceCount: i.evidenceCount,
        tone: i.tone,
      },
      // The deterministic sentence is already safe — it is the guaranteed output.
      deterministicText: i.title,
    }));
}

export interface InterpretOptions {
  task: AITask;
  findings: StructuredFinding[];
  notes?: string[];
  /** AI is only attempted when the user has consented AND enabled it. */
  aiEnabled: boolean;
  provider?: AIInterpretationProvider;
}

const deterministicFallback = new LocalTemplateProvider();

async function deterministicText(task: AITask, findings: StructuredFinding[], notes?: string[]): Promise<string> {
  const req: AIRequest = { task, findings, ...(notes ? { notes } : {}) };
  const res = await deterministicFallback.summarise(req);
  return res.text;
}

export async function interpret(opts: InterpretOptions): Promise<AISummary> {
  const request: AIRequest = {
    task: opts.task,
    findings: opts.findings,
    ...(opts.notes ? { notes: opts.notes } : {}),
  };

  // No consent / disabled / no provider → deterministic.
  if (!opts.aiEnabled || !opts.provider || !opts.provider.available()) {
    return { source: 'deterministic', text: await deterministicText(opts.task, opts.findings, opts.notes) };
  }

  try {
    const result = await opts.provider.summarise(request);
    const validation = validateAIOutput(result.text);
    if (!validation.ok) {
      // Failed safety validation → fall back, never show unsafe AI text.
      return {
        source: 'deterministic',
        text: await deterministicText(opts.task, opts.findings, opts.notes),
        fellBack: true,
      };
    }
    return { source: 'ai', text: result.text };
  } catch {
    // Network / rate-limit / provider error → deterministic fallback.
    return {
      source: 'deterministic',
      text: await deterministicText(opts.task, opts.findings, opts.notes),
      fellBack: true,
    };
  }
}
