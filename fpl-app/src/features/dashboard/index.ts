/**
 * Dashboard — the home-screen "personal scout report".
 *
 * Proactively surfaces the manager's key info on arrival (projected points,
 * captain, squad value, bank) plus headline insights, rather than opening into
 * a builder. Composes the prediction, fixture, optimiser, lineup, and transfer
 * engines; adds no new modelling.
 */
export * from "./insights";
export * from "./chips";
export { useScoutReport, type ScoutReport } from "./useScoutReport";
export { ScoutReport as ScoutReportView } from "./components";
