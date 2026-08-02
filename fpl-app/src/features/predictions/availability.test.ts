import { describe, expect, it } from "vitest";
import { makePlayer } from "@/test/factories";
import { availabilityFactor } from "./model/minutes";

describe("availability handling", () => {
  it("zeroes injured/suspended players (no explicit chance)", () => {
    expect(availabilityFactor(makePlayer({ availability: "injured" }))).toBe(0);
    expect(availabilityFactor(makePlayer({ availability: "suspended" }))).toBe(
      0,
    );
  });

  it("halves doubtful players by default", () => {
    expect(availabilityFactor(makePlayer({ availability: "doubtful" }))).toBe(
      0.5,
    );
  });

  it("uses the explicit chance-of-playing when FPL provides it", () => {
    const flagged = makePlayer({
      availability: "doubtful",
      chanceOfPlayingNextRound: 25,
    });
    expect(availabilityFactor(flagged)).toBeCloseTo(0.25);
  });

  it("treats fully available players as 1", () => {
    expect(availabilityFactor(makePlayer({ availability: "available" }))).toBe(
      1,
    );
  });
});
