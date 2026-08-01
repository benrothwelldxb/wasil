import { describe, expect, it } from "vitest";
import { formatCountdown } from "./deadline";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatCountdown", () => {
  it("shows days + hours when more than a day out", () => {
    expect(formatCountdown(DAY + 4 * HOUR + 30 * MIN)).toBe("1d 4h");
  });

  it("shows hours + minutes within a day", () => {
    expect(formatCountdown(4 * HOUR + 12 * MIN)).toBe("4h 12m");
  });

  it("shows minutes within the hour (never 0)", () => {
    expect(formatCountdown(12 * MIN)).toBe("12m");
    expect(formatCountdown(20_000)).toBe("1m");
  });

  it("returns null once the deadline has passed", () => {
    expect(formatCountdown(0)).toBeNull();
    expect(formatCountdown(-5000)).toBeNull();
  });
});
