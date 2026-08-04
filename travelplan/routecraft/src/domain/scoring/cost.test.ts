import { describe, expect, it } from 'vitest';
import type { Money, Pax } from '../types';
import { computeCostBreakdown, farePax, money, totalHeads } from './cost';

const usd = (amount: number): Money => ({ amount, currency: 'USD' });
const solo: Pax = { adults: 1, children: 0 };

describe('cost helpers', () => {
  it('rounds money to two decimal places', () => {
    expect(money(10.005).amount).toBe(10.01);
    expect(money(10.004).amount).toBe(10);
  });

  it('counts heads and fare-weights children at 75%', () => {
    expect(totalHeads({ adults: 2, children: 2 })).toBe(4);
    expect(farePax({ adults: 2, children: 2 })).toBe(3.5);
  });
});

describe('computeCostBreakdown boundary conditions', () => {
  it('never returns a negative headroom and clamps headroomPct to [0,1]', () => {
    const cost = computeCostBreakdown({ legs: [], stopovers: [], pax: solo, budget: usd(1000) });
    expect(cost.total.amount).toBe(0);
    expect(cost.headroom.amount).toBe(1000);
    expect(cost.headroomPct).toBe(1);
  });

  it('guards against a zero budget (no divide-by-zero in headroomPct)', () => {
    const cost = computeCostBreakdown({ legs: [], stopovers: [], pax: solo, budget: usd(0) });
    expect(cost.headroomPct).toBe(0);
    expect(Number.isNaN(cost.headroomPct)).toBe(false);
  });

  it('guards against zero heads (no divide-by-zero in perPerson)', () => {
    const cost = computeCostBreakdown({
      legs: [],
      stopovers: [],
      pax: { adults: 0, children: 0 },
      budget: usd(500),
    });
    expect(Number.isNaN(cost.perPerson.amount)).toBe(false);
    expect(cost.perPerson.amount).toBe(0);
  });
});
