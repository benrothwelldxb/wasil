/**
 * Manager — connect a real FPL team by Manager ID.
 *
 * Imports the user's actual 15-player squad from the public FPL API so every
 * feature (scout report, chips, transfers, share card) reflects their real
 * team, and greets them by name. Auto-syncs each visit.
 */
export { useManagerStore } from "./store";
export { useImportFlash } from "./flash";
export { useManagerTeam, type UseManagerTeamResult } from "./useManagerTeam";
export * from "./components";
