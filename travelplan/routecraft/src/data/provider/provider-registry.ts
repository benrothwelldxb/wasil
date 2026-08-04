/**
 * The single swap point for the journey data source. Everything upstream calls
 * `getJourneyProvider()`; replacing the synthetic engine with a real API means
 * changing only this file.
 *
 * A lazy module singleton so importing this module never eagerly constructs
 * the engine (and therefore never touches flags/env) as a side effect.
 */
import { createFlightEngine } from '@/data/engine';
import type { JourneyProvider } from './JourneyProvider';

let engine: JourneyProvider | null = null;

export function getJourneyProvider(): JourneyProvider {
  return (engine ??= createFlightEngine());
}

/** Test-only: clears the singleton so the next `getJourneyProvider()` call rebuilds it. */
export function resetJourneyProviderForTests(): void {
  engine = null;
}
