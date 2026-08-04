/**
 * Shared motion tokens — the single source of truth for animation timing
 * across Framer Motion usages and any CSS/`setTimeout` durations. Values
 * were previously scattered magic numbers on individual components:
 *
 *   - card hover / micro-interactions   → 0.2s  (JourneyCard tap/hover)
 *   - page transitions / timelines      → 0.35s (LandingPage, ItineraryTimeline,
 *                                                 JourneyDetailPage)
 *   - map path draw / larger reveals    → 0.6s  (RouteMap path)
 *   - ring count-up / big emphasis      → 0.8s  (ExperienceRing stroke + count-up)
 *
 * `MOTION` holds Framer Motion-friendly values (seconds, as `transition.duration`
 * expects). `MOTION_MS` is the same scale in integer milliseconds, for
 * `setTimeout`/`setInterval`/CSS custom properties that want ms.
 *
 * Components own their own `motion.div`/`transition` props — this module only
 * defines the numbers; it does not import React or Framer Motion.
 */

export const MOTION = {
  /** Micro-interactions: hover/tap feedback, small state flips. */
  fast: 0.2,
  /** Default: page transitions, timeline reveals, most enter/exit animation. */
  base: 0.35,
  /** Larger emphasis: route map path draw, big reveals. */
  slow: 0.6,
  /** Count-up / stroke-fill style emphasis animations (e.g. ExperienceRing). */
  emphasis: 0.8,
  /** Shared easing curve — a gentle "ease out, slight overshoot-free" cubic bezier. */
  ease: [0.16, 1, 0.3, 1] as const,
} as const;

/** `MOTION`'s durations expressed in integer milliseconds. */
export const MOTION_MS = {
  fast: Math.round(MOTION.fast * 1000),
  base: Math.round(MOTION.base * 1000),
  slow: Math.round(MOTION.slow * 1000),
  emphasis: Math.round(MOTION.emphasis * 1000),
} as const;
