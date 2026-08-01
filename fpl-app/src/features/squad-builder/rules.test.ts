import { describe, expect, it } from "vitest";
import { makePlayer } from "@/test/factories";
import { checkCanAdd, computeSquadState, SQUAD_RULES } from "./rules";

const gk = (id: number, team = id) =>
  makePlayer({ id, positionId: 1, teamId: team, price: { playerId: id, webName: "", now: 4.5, nowRaw: 45, changeEvent: 0, changeStart: 0 } });
const def = (id: number, team = id) =>
  makePlayer({ id, positionId: 2, teamId: team, price: { playerId: id, webName: "", now: 5, nowRaw: 50, changeEvent: 0, changeStart: 0 } });

describe("computeSquadState", () => {
  it("treats an empty squad as legal but incomplete", () => {
    const s = computeSquadState([]);
    expect(s.isLegal).toBe(true);
    expect(s.isComplete).toBe(false);
    expect(s.remaining).toBe(SQUAD_RULES.budget);
    expect(s.issues.filter((i) => i.level === "todo").length).toBeGreaterThan(0);
  });

  it("flags too many in a position as an error", () => {
    const s = computeSquadState([gk(1), gk(2), gk(3)]);
    expect(s.isLegal).toBe(false);
    expect(s.issues.some((i) => i.level === "error")).toBe(true);
  });
});

describe("checkCanAdd", () => {
  it("blocks a duplicate", () => {
    const squad = [def(1)];
    const state = computeSquadState(squad);
    expect(checkCanAdd(def(1), state, new Set([1])).canAdd).toBe(false);
  });

  it("blocks a fourth player from one club", () => {
    const squad = [def(1, 7), def(2, 7), def(3, 7)];
    const state = computeSquadState(squad);
    const res = checkCanAdd(def(4, 7), state, new Set([1, 2, 3]));
    expect(res.canAdd).toBe(false);
    expect(res.reason).toMatch(/club|from/i);
  });

  it("blocks an unaffordable player", () => {
    const expensive = makePlayer({
      id: 9,
      positionId: 2,
      teamId: 9,
      price: { playerId: 9, webName: "", now: 99, nowRaw: 990, changeEvent: 0, changeStart: 0 },
    });
    const squad = [def(1), def(2), def(3)];
    const state = computeSquadState(squad); // remaining < £99m
    expect(checkCanAdd(expensive, state, new Set([1, 2, 3])).canAdd).toBe(false);
  });

  it("allows a legal add", () => {
    const state = computeSquadState([def(1)]);
    expect(checkCanAdd(def(2, 2), state, new Set([1])).canAdd).toBe(true);
  });
});
