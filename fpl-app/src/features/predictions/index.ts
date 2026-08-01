/**
 * Expected Points (xPts) Prediction Engine — public API.
 *
 * A standalone, statistical (no-AI) engine that predicts each player's FPL
 * points for the next 1/3/5/8 gameweeks with a fully inspectable breakdown and
 * confidence. Consumers (Squad Optimiser, Captain Selector, Transfer Planner,
 * AI Manager) depend on the `PredictionEngine` interface, so an ML engine can
 * replace it later without touching the rest of the app.
 *
 * All coefficients live in `config.ts`.
 */
export * from "./config";
export * from "./types";
export * from "./model";
export { buildPredictionContext } from "./context";
export {
  StatisticalPredictionEngine,
  predictionEngine,
} from "./engine";
export { usePredictions, type UsePredictionsResult } from "./usePredictions";
export * from "./components";
