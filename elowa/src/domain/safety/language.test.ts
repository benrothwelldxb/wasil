import { describe, it, expect } from 'vitest';
import { findUnsafeLanguage, isSafeCopy, safeCopy } from './language';

describe('findUnsafeLanguage', () => {
  it('flags causation, diagnosis and treatment-advice phrasing', () => {
    expect(isSafeCopy('This caused your symptoms')).toBe(false);
    expect(isSafeCopy('This proves you are perimenopausal')).toBe(false);
    expect(isSafeCopy('Your oestrogen is low')).toBe(false);
    expect(isSafeCopy('You should increase your dose')).toBe(false);
    expect(isSafeCopy('This is definitely hormonal')).toBe(false);
    expect(isSafeCopy('You can diagnose this yourself')).toBe(false);
  });

  it('accepts cautious, observational phrasing', () => {
    expect(isSafeCopy('Your sleep has been more disrupted than usual this week.')).toBe(true);
    expect(isSafeCopy('These tended to occur together in your data.')).toBe(true);
    expect(isSafeCopy('This changed around the same time as your treatment change.')).toBe(true);
  });
});

describe('safeCopy templates', () => {
  it('produce only safe copy', () => {
    const samples = [
      safeCopy.changeWorse('Sleep'),
      safeCopy.improvement('Sleep'),
      safeCopy.frequency('Hot flushes', 5, 7),
      safeCopy.cooccurrence('Sleep', 'Anxiety'),
      safeCopy.sequence('poor sleep', 'Energy'),
      safeCopy.treatmentObservation('Night sweats', 'HRT change', '12 June', 'less'),
    ];
    for (const s of samples) {
      expect(findUnsafeLanguage(s.title)).toEqual([]);
      expect(findUnsafeLanguage(s.body)).toEqual([]);
    }
  });

  it('treatment observation carries the association-not-causation caveat', () => {
    const s = safeCopy.treatmentObservation('Night sweats', 'HRT change', '12 June', 'less');
    expect(s.body.toLowerCase()).toContain('does not establish');
  });

  it('co-occurrence describes both symptoms in the same direction (both worse)', () => {
    const s = safeCopy.cooccurrence('Sleep', 'Anxiety');
    // Must not imply opposite directions (one lower, one higher).
    expect(s.title.toLowerCase()).not.toContain('lower');
    expect(s.title.toLowerCase().match(/worse-than-usual/g)?.length).toBe(2);
  });

  it('frequency title reflects worse-than-usual days, not just logging', () => {
    expect(safeCopy.frequency('Hot flushes', 5, 7).title.toLowerCase()).toContain('worse than usual');
  });
});
