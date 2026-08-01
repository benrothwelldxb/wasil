import { describe, expect, it } from "vitest";
import { makePlayer } from "@/test/factories";
import { priceWatch } from "./predict";

const TOTAL = 10_000_000;

describe("priceWatch", () => {
  it("ranks strong net-in players as likely risers and net-out as fallers", () => {
    const players = [
      makePlayer({ id: 1, transfersInEvent: 200_000, transfersOutEvent: 10_000 }),
      makePlayer({ id: 2, transfersInEvent: 5_000, transfersOutEvent: 180_000 }),
      makePlayer({ id: 3, transfersInEvent: 100, transfersOutEvent: 120 }), // noise
    ];
    const { risers, fallers } = priceWatch(players, TOTAL);
    expect(risers.map((p) => p.player.id)).toEqual([1]);
    expect(fallers.map((p) => p.player.id)).toEqual([2]);
    expect(risers[0]?.likelihood).toBe("high"); // 190k/10M = 1.9%
  });

  it("ignores players below the momentum threshold", () => {
    const players = [
      makePlayer({ id: 1, transfersInEvent: 1_000, transfersOutEvent: 500 }),
    ];
    const { risers, fallers } = priceWatch(players, TOTAL);
    expect(risers).toHaveLength(0);
    expect(fallers).toHaveLength(0);
  });

  it("sorts risers by net transfers, biggest first", () => {
    const players = [
      makePlayer({ id: 1, transfersInEvent: 80_000, transfersOutEvent: 0 }),
      makePlayer({ id: 2, transfersInEvent: 300_000, transfersOutEvent: 0 }),
    ];
    expect(priceWatch(players, TOTAL).risers.map((p) => p.player.id)).toEqual([
      2, 1,
    ]);
  });
});
