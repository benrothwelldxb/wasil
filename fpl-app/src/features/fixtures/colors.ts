/**
 * Colour scales for fixture difficulty and ratings, echoing the familiar FPL
 * FDR palette. Kept in one place so the ticker, pills, and badges stay
 * consistent in light and dark themes.
 */

/** Background + text classes for a raw FPL difficulty (1 easiest … 5 hardest). */
export function difficultyClasses(difficulty: number): string {
  switch (Math.round(difficulty)) {
    case 1:
      return "bg-emerald-600 text-white";
    case 2:
      return "bg-emerald-400 text-emerald-950";
    case 3:
      return "bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-slate-50";
    case 4:
      return "bg-rose-500 text-white";
    case 5:
      return "bg-rose-700 text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Text-colour class for a 0–100 ease rating. */
export function ratingTextClass(rating: number): string {
  if (rating >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (rating >= 55) return "text-lime-600 dark:text-lime-400";
  if (rating >= 45) return "text-amber-600 dark:text-amber-400";
  if (rating >= 30) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

/** Background class for a 0–100 ease rating (for meters / chips). */
export function ratingBgClass(rating: number): string {
  if (rating >= 70) return "bg-emerald-500";
  if (rating >= 55) return "bg-lime-500";
  if (rating >= 45) return "bg-amber-500";
  if (rating >= 30) return "bg-orange-500";
  return "bg-rose-500";
}
