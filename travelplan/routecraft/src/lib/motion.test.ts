import { describe, expect, it } from 'vitest';
import { MOTION, MOTION_MS } from './motion';

describe('MOTION / MOTION_MS', () => {
  it('is ordered fast < base < slow < emphasis', () => {
    expect(MOTION.fast).toBeLessThan(MOTION.base);
    expect(MOTION.base).toBeLessThan(MOTION.slow);
    expect(MOTION.slow).toBeLessThan(MOTION.emphasis);
  });

  it('MOTION_MS mirrors MOTION in integer milliseconds', () => {
    expect(MOTION_MS.fast).toBe(200);
    expect(MOTION_MS.base).toBe(350);
    expect(MOTION_MS.slow).toBe(600);
    expect(MOTION_MS.emphasis).toBe(800);
  });

  it('exposes a 4-value cubic-bezier easing curve', () => {
    expect(MOTION.ease).toHaveLength(4);
  });
});
