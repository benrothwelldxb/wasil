import { describe, expect, it } from "vitest";
import { makePlayer } from "@/test/factories";
import { analyzeTemplate } from "./analyze";

describe("analyzeTemplate", () => {
  const all = [
    makePlayer({ id: 1, selectedByPercent: 3 }), // owned differential
    makePlayer({ id: 2, selectedByPercent: 45 }), // owned template
    makePlayer({ id: 3, selectedByPercent: 60 }), // NOT owned, big template
    makePlayer({ id: 4, selectedByPercent: 35 }), // NOT owned, template
    makePlayer({ id: 5, selectedByPercent: 8 }), // NOT owned, low own
  ];

  it("flags your low-owned picks as differentials", () => {
    const { differentials } = analyzeTemplate([1, 2], all);
    expect(differentials.map((p) => p.id)).toEqual([1]);
  });

  it("lists popular players you don't own, most-owned first", () => {
    const { missingTemplate } = analyzeTemplate([1, 2], all);
    expect(missingTemplate.map((p) => p.id)).toEqual([3, 4]);
  });

  it("returns empty when fully on-template and owning all popular picks", () => {
    const { differentials, missingTemplate } = analyzeTemplate(
      [2, 3, 4],
      [all[1]!, all[2]!, all[3]!],
    );
    expect(differentials).toHaveLength(0);
    expect(missingTemplate).toHaveLength(0);
  });
});
