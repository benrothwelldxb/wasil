import { describe, expect, it } from "vitest";
import { buildTeamCardSvg, type TeamCardData } from "./card";

const player = (
  name: string,
  positionId: number,
  points = 5,
  isCaptain = false,
) => ({ name, positionId, points, isCaptain, isVice: false });

const base: TeamCardData = {
  gameweek: 7,
  projectedPoints: 68.3,
  formation: "4-4-2",
  starters: [
    player("Raya", 1),
    player("Gabriel", 2),
    player("Saliba", 2),
    player("Gvardiol", 2),
    player("Hall", 2),
    player("Salah", 3, 9.6, true),
    player("Saka", 3),
    player("Palmer", 3),
    player("Semenyo", 3),
    player("Haaland", 4),
    player("Isak", 4),
  ],
  bench: [
    player("Sels", 1),
    player("Rogers", 3),
    player("Mbeumo", 4),
    player("Wissa", 4),
  ],
  captainName: "Salah",
  squadValue: 100,
  bank: 0.5,
  source: "yours",
};

describe("buildTeamCardSvg", () => {
  it("produces a well-formed SVG with headline figures", () => {
    const svg = buildTeamCardSvg(base);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("68.3"); // projected points
    expect(svg).toContain("4-4-2"); // formation
    expect(svg).toContain("GW 7");
    expect(svg).toContain("Salah");
    expect(svg).toContain(">C<"); // captain badge
  });

  it("escapes XML-special characters in player names", () => {
    // Short enough not to truncate, so the escaping is what's under test.
    const svg = buildTeamCardSvg({
      ...base,
      starters: base.starters.map((p, i) =>
        i === 0 ? { ...p, name: "A&B <O'N>" } : p,
      ),
    });
    expect(svg).toContain("A&amp;B &lt;O&apos;N&gt;");
    // The raw, unescaped form must never appear (it would break parsing).
    expect(svg).not.toContain("A&B <O'N>");
  });

  it("truncates over-long names so pitch rows don't overlap", () => {
    const svg = buildTeamCardSvg({
      ...base,
      starters: base.starters.map((p, i) =>
        i === 1 ? { ...p, name: "Alexander-Arnold" } : p,
      ),
    });
    expect(svg).toContain("…");
    expect(svg).not.toContain("Alexander-Arnold");
  });

  it("labels a suggested team and omits it for the user's own", () => {
    expect(buildTeamCardSvg({ ...base, source: "suggested" })).toContain(
      "Suggested team",
    );
    expect(buildTeamCardSvg(base)).not.toContain("Suggested team");
  });
});
