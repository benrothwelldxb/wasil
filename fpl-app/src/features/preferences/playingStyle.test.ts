import { describe, expect, it } from "vitest";
import { makePlayer } from "@/test/factories";
import { createPreferenceService } from "./PreferenceService";
import { NEUTRAL_PREFERENCES } from "./profiles";

const score = (playingStyle: "attack" | "balanced" | "defence", positionId: number) =>
  createPreferenceService({ ...NEUTRAL_PREFERENCES, playingStyle })
    .adjustPlayerScore(makePlayer({ id: positionId, positionId }), 10)
    .adjustedScore;

describe("playing-style positional bias", () => {
  it("defence focus favours defenders over forwards", () => {
    const def = score("defence", 2);
    const fwd = score("defence", 4);
    expect(def).toBeGreaterThan(10);
    expect(def).toBeGreaterThan(fwd);
  });

  it("attack focus favours forwards over defenders", () => {
    const fwd = score("attack", 4);
    const def = score("attack", 2);
    expect(fwd).toBeGreaterThan(10);
    expect(fwd).toBeGreaterThan(def);
  });

  it("balanced style leaves scores untouched", () => {
    expect(score("balanced", 2)).toBe(10);
    expect(score("balanced", 4)).toBe(10);
  });
});
