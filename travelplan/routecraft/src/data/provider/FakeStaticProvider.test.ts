import { describe, expect, it } from 'vitest';
import { journeySchema, searchResultSchema } from '@/domain/schemas';
import { fakeStaticProvider } from './FakeStaticProvider';

describe('FakeStaticProvider', () => {
  it('returns schema-valid journeys', async () => {
    const result = await fakeStaticProvider.searchJourneys();
    expect(() => searchResultSchema.parse(result)).not.toThrow();
    expect(result.journeys.length).toBeGreaterThanOrEqual(2);
    for (const j of result.journeys) {
      expect(() => journeySchema.parse(j)).not.toThrow();
    }
  });

  it('exposes a stable provider id', () => {
    expect(fakeStaticProvider.id).toBe('fake-static');
  });

  it('getJourney round-trips a known id and returns null otherwise', async () => {
    const result = await fakeStaticProvider.searchJourneys();
    const id = result.journeys[0].id;
    expect((await fakeStaticProvider.getJourney(id))?.id).toBe(id);
    expect(await fakeStaticProvider.getJourney('missing')).toBeNull();
  });
});
