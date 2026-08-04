/**
 * The single swap point for the journey data source. Everything upstream calls
 * `getJourneyProvider()`; replacing the synthetic engine with a real API means
 * changing only this file.
 */
import { syntheticProvider } from '@/data/synthetic/SyntheticJourneyProvider';
import type { JourneyProvider } from './JourneyProvider';

export function getJourneyProvider(): JourneyProvider {
  return syntheticProvider;
}
