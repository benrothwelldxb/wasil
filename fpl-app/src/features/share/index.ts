/**
 * Share — turn the user's team into a beautiful, self-contained card image and
 * share it via the Web Share API (or download it). Pure presentation: callers
 * supply a `TeamCardData` assembled from the prediction/lineup engines.
 */
export {
  buildTeamCardSvg,
  CARD_WIDTH,
  CARD_HEIGHT,
  type TeamCardData,
  type TeamCardPlayer,
} from "./card";
export {
  svgToDataUrl,
  svgToPngBlob,
  shareOrDownloadPng,
  type ShareResult,
} from "./image";
export * from "./components";
