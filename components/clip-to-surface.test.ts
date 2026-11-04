import { describe, expect, it } from "vitest";
import { clipToSurface } from "../e2e/helpers/surface-sampler";

// Unit guard for the e2e ring clip (task 012 round 2 ruling): a ring side is measured only where it
// lies inside the surface under test, and a side with no pixel left inside must fail loudly.
// Red-proof (unit level): replacing clipToSurface's body with `return sides` turns the first and
// third cases red.

const surface = { x: 10, y: 10, w: 100, h: 50 };

describe("clipToSurface (ring sides confined to the surface under test)", () => {
  it("leaves a side that already lies inside the surface unchanged", () => {
    const inside = [{ x: 20, y: 12, w: 30, h: 6 }];
    expect(clipToSurface(inside, surface, "t")).toEqual([{ x: 20, y: 12, w: 30, h: 6 }]);
  });

  it("clips a side that crosses the top edge to the rows inside the surface", () => {
    // Side rows 6..11 (6 rows); the surface starts at y=10, so only rows 10 and 11 are inside.
    const crossing = [{ x: 20, y: 6, w: 30, h: 6 }];
    expect(clipToSurface(crossing, surface, "t")).toEqual([{ x: 20, y: 10, w: 30, h: 2 }]);
  });

  it("clips a side that crosses the bottom edge", () => {
    // Surface bottom is y=60; a side over rows 58..63 keeps rows 58 and 59.
    const crossing = [{ x: 20, y: 58, w: 30, h: 6 }];
    expect(clipToSurface(crossing, surface, "t")).toEqual([{ x: 20, y: 58, w: 30, h: 2 }]);
  });

  it("throws, naming the side, when a side has no pixel left inside the surface", () => {
    const outside = [{ x: 20, y: 0, w: 30, h: 6 }];
    expect(() => clipToSurface(outside, surface, "wordmark")).toThrow(/wordmark: ring side 0 has no pixel inside/);
  });

  it("clips fractional surface edges to whole pixels inside them", () => {
    const fractional = { x: 10.4, y: 10.4, w: 100, h: 50 };
    // Surface starts at 10.4, so pixel row 10 is partly outside and is excluded (ceil to 11).
    const side = [{ x: 20, y: 8, w: 30, h: 6 }];
    expect(clipToSurface(side, fractional, "t")).toEqual([{ x: 20, y: 11, w: 30, h: 3 }]);
  });
});
