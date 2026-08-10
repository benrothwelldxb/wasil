/**
 * AI interpretation provider abstraction (Phase 2).
 *
 * The deterministic Pattern Engine produces StructuredFinding[] FIRST. An
 * AIInterpretationProvider may only reword/synthesise those findings — it never
 * inspects raw data or invents conclusions. Providers are replaceable; a real
 * LLM would live behind a server proxy (no client-side secrets). See
 * `docs/AI.md`.
 */

import type { StructuredFinding } from '@/domain/models';

export type AITask =
  | 'summarise_findings'
  | 'appointment_questions'
  | 'summarise_notes'
  | 'monthly_reflection';

export interface AIRequest {
  task: AITask;
  /** Structured, already-safe findings — the only data the provider may use. */
  findings: StructuredFinding[];
  /** Optional user notes (only included when the user hasn't excluded them). */
  notes?: string[];
}

export interface AIProviderResult {
  text: string;
}

export interface AIInterpretationProvider {
  readonly id: string;
  readonly label: string;
  /** True if sending data to this provider would leave the device. */
  readonly transmitsData: boolean;
  available(): boolean;
  summarise(request: AIRequest): Promise<AIProviderResult>;
}
