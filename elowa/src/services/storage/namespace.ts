/**
 * Storage namespacing & schema versioning.
 *
 * Real user data and demo data live in *separate* key prefixes so they can
 * never be mixed. A schema version is stored alongside the data so future
 * migrations have an anchor point.
 */
export const SCHEMA_VERSION = 1;

export const REAL_PREFIX = `elowa:v${SCHEMA_VERSION}:real:`;
export const DEMO_PREFIX = `elowa:v${SCHEMA_VERSION}:demo:`;

/** App-level meta lives outside the versioned data prefixes. */
export const META_PREFIX = 'elowa:meta:';

/** Collection keys used by repositories (within a data prefix). */
export const StorageKeys = {
  schemaVersion: 'schemaVersion',
  session: 'session',
  preferences: 'preferences',
  symptomConfig: 'symptomConfig',
  checkIns: 'checkIns',
  periods: 'periods',
  treatments: 'treatments',
  appointmentQuestions: 'appointmentQuestions',
  healthSamples: 'healthSamples',
  healthPermissions: 'healthPermissions',
  symptomPrivacy: 'symptomPrivacy',
  insightFeedback: 'insightFeedback',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];
