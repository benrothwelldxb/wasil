import { describe, it, expect } from 'vitest';
import { validateAIOutput } from './validation';
import { interpret, toStructuredFindings } from './pipeline';
import type { AIInterpretationProvider, AIRequest } from './types';
import type { Insight, StructuredFinding } from '@/domain/models';

const finding: StructuredFinding = {
  id: 'f1',
  kind: 'change',
  strength: 'recurring',
  facts: { title: 'Your sleep has been more disrupted than usual this week.' },
  deterministicText: 'Your sleep has been more disrupted than usual this week.',
};

describe('validateAIOutput', () => {
  it('rejects diagnosis / causation / treatment-advice phrasing', () => {
    expect(validateAIOutput('You have perimenopause.').ok).toBe(false);
    expect(validateAIOutput('This confirms low oestrogen.').ok).toBe(false);
    expect(validateAIOutput('This is caused by your hormones.').ok).toBe(false);
    expect(validateAIOutput('You should increase your dose.').ok).toBe(false);
    expect(validateAIOutput('   ').ok).toBe(false);
  });
  it('accepts observational wording', () => {
    expect(validateAIOutput('In your recent data: your sleep has been more disrupted than usual.').ok).toBe(true);
  });
});

describe('interpret pipeline', () => {
  it('returns deterministic text when AI is disabled', async () => {
    const out = await interpret({ task: 'summarise_findings', findings: [finding], aiEnabled: false });
    expect(out.source).toBe('deterministic');
    expect(out.text.length).toBeGreaterThan(0);
  });

  it('uses the provider when enabled and output is safe', async () => {
    const provider: AIInterpretationProvider = {
      id: 't',
      label: 't',
      transmitsData: false,
      available: () => true,
      summarise: async (_r: AIRequest) => ({ text: 'In your recent data, sleep was more disrupted than usual.' }),
    };
    const out = await interpret({ task: 'summarise_findings', findings: [finding], aiEnabled: true, provider });
    expect(out.source).toBe('ai');
  });

  it('falls back to deterministic when AI output fails validation', async () => {
    const unsafe: AIInterpretationProvider = {
      id: 'u',
      label: 'u',
      transmitsData: false,
      available: () => true,
      summarise: async () => ({ text: 'You have perimenopause and should increase your dose.' }),
    };
    const out = await interpret({ task: 'summarise_findings', findings: [finding], aiEnabled: true, provider: unsafe });
    expect(out.source).toBe('deterministic');
    expect(out.fellBack).toBe(true);
  });

  it('falls back when the provider throws (network/rate-limit)', async () => {
    const boom: AIInterpretationProvider = {
      id: 'b',
      label: 'b',
      transmitsData: true,
      available: () => true,
      summarise: async () => {
        throw new Error('rate limit');
      },
    };
    const out = await interpret({ task: 'summarise_findings', findings: [finding], aiEnabled: true, provider: boom });
    expect(out.source).toBe('deterministic');
    expect(out.fellBack).toBe(true);
  });
});

describe('toStructuredFindings', () => {
  it('excludes AI-excluded measures from the AI input', () => {
    const insights: Insight[] = [
      { id: 'a', kind: 'change', tone: 'watch', strength: 'recurring', score: 0.8, evidenceCount: 6, title: 'Sleep worse', body: '', explanation: '', relatedMeasureKeys: ['sym_sleep'] },
      { id: 'b', kind: 'change', tone: 'watch', strength: 'recurring', score: 0.7, evidenceCount: 6, title: 'Mood worse', body: '', explanation: '', relatedMeasureKeys: ['sym_mood'] },
    ];
    const findings = toStructuredFindings(insights, { excludeKeys: new Set(['sym_mood']) });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('a');
  });
});
