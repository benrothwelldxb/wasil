import { describe, expect, it } from "vitest";
import { makePlayer } from "@/test/factories";
import { createPreferenceService } from "./PreferenceService";
import { NEUTRAL_PREFERENCES } from "./profiles";

describe("avoid-club preference", () => {
  it("strongly penalises a player from an avoided club", () => {
    const service = createPreferenceService({
      ...NEUTRAL_PREFERENCES,
      avoidClubIds: [1],
    });
    const rival = makePlayer({ id: 1, teamId: 1 });
    const adjusted = service.adjustPlayerScore(rival, 10);

    expect(adjusted.adjustedScore).toBeLessThan(10);
    expect(adjusted.adjustments.some((a) => a.source === "club-avoid")).toBe(
      true,
    );
  });

  it("leaves players from other clubs untouched", () => {
    const service = createPreferenceService({
      ...NEUTRAL_PREFERENCES,
      avoidClubIds: [1],
    });
    const other = makePlayer({ id: 2, teamId: 2 });
    const adjusted = service.adjustPlayerScore(other, 10);

    expect(adjusted.adjustedScore).toBe(10);
    expect(adjusted.adjustments).toHaveLength(0);
  });

  it("does nothing when no clubs are avoided", () => {
    const service = createPreferenceService(NEUTRAL_PREFERENCES);
    const adjusted = service.adjustPlayerScore(makePlayer({ teamId: 1 }), 10);
    expect(adjusted.adjustedScore).toBe(10);
  });
});
