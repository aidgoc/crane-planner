// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Acceptance Tests for Task M6: Boom clearance to site obstacles
// Owner: Abhishek
// ============================================================================

import { ShapeFactory } from "@chili3d/wasm";
import { MM_PER_M } from "../src/clearance/distance";
import {
    type BoomPlacement,
    boomDirection,
    buildBoomSolid,
    buildBuildingSolid,
    buildPowerLineWall,
    checkOneClearance,
    computeSiteClearance,
    isRedFlag,
    type ObstacleClearanceResult,
    type ObstacleFootprint,
    type PowerLineObstacle,
    type SiteClearanceReport,
    statusFor,
    statusToColour,
    validateBoomPlacement,
} from "../src/clearance/siteClearance";
import "./setup";

// ---------------------------------------------------------------------------
// Sample-site obstacle definitions. Footprints, heights and the power line position
// come from public/sample-site/sample-site.json. All coordinates in metres; X = east, Y = north.
// Clearance limits: power line 6.0 m is the INDICATIVE value in the sample JSON.
// Buildings 2.0 m is a TEST INPUT (not in the JSON, not a regulatory value).
// ---------------------------------------------------------------------------
const TOWER_A: ObstacleFootprint = {
    id: "tower_a",
    label: "Tower A  G+24  75 m",
    polygon: [
        [25, 20],
        [65, 20],
        [65, 42],
        [25, 42],
    ],
    height_m: 75.0,
    clearanceLimitM: 2.0,
};

const PODIUM: ObstacleFootprint = {
    id: "podium",
    label: "Podium  2 levels  9 m",
    polygon: [
        [15, 12],
        [75, 12],
        [75, 50],
        [15, 50],
    ],
    height_m: 9.0,
    clearanceLimitM: 2.0,
};

const TOWER_B: ObstacleFootprint = {
    id: "tower_b",
    label: "Tower B  G+14  45 m",
    polygon: [
        [50, 54],
        [70, 54],
        [70, 68],
        [50, 68],
    ],
    height_m: 45.0,
    clearanceLimitM: 2.0,
};

const POWER_LINE: PowerLineObstacle = {
    id: "power_line",
    label: "22 kV overhead power line (x = −9 m) — clearance INDICATIVE",
    x_m: -9.0,
    clearanceLimitM: 6.0,
};

// ---------------------------------------------------------------------------
// Helper: default safe placement (well west of Tower A)
// ---------------------------------------------------------------------------
function safePlacement(overrides: Partial<BoomPlacement> = {}): BoomPlacement {
    return {
        pivotM: { x: 10.0, y: 31.0, z: 0.0 },
        boomRadiusM: 0.5,
        boomLengthM: 12.0,
        slewDeg: 0,
        elevationDeg: 0,
        ...overrides,
    };
}

// ===========================================================================
describe("Task M6: boomDirection helper", () => {
    test("slew=0, elevation=0 → +X (east, horizontal)", () => {
        // Hand calc: cos(0)=1, sin(0)=0, cosElev=cos(0)=1 → {x:1, y:0, z:0}
        const d = boomDirection(0, 0);
        expect(d.x).toBeCloseTo(1, 6);
        expect(d.y).toBeCloseTo(0, 6);
        expect(d.z).toBeCloseTo(0, 6);
    });

    test("slew=90, elevation=0 → +Y (north, horizontal)", () => {
        // Hand calc: cos(90°)=0, sin(90°)=1, cosElev=1 → {x:0, y:1, z:0}
        const d = boomDirection(90, 0);
        expect(d.x).toBeCloseTo(0, 6);
        expect(d.y).toBeCloseTo(1, 6);
        expect(d.z).toBeCloseTo(0, 6);
    });

    test("slew=0, elevation=90 → straight up +Z", () => {
        // Hand calc: cosElev=cos(90°)=0, sinElev=1 → {x:0, y:0, z:1}
        const d = boomDirection(0, 90);
        expect(d.x).toBeCloseTo(0, 4);
        expect(d.y).toBeCloseTo(0, 4);
        expect(d.z).toBeCloseTo(1, 6);
    });

    test("slew=45, elevation=0 → NE diagonal in XY, unit length", () => {
        // Hand calc: cos(45°)=sin(45°)=√2/2 ≈ 0.7071, z=0
        // Length = √(0.5 + 0.5 + 0) = 1.0
        const d = boomDirection(45, 0);
        const len = Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2);
        expect(len).toBeCloseTo(1.0, 6);
        expect(d.x).toBeCloseTo(Math.cos(Math.PI / 4), 6);
        expect(d.y).toBeCloseTo(Math.sin(Math.PI / 4), 6);
    });
});

// ===========================================================================
describe("Task M6: validateBoomPlacement — input guard before WASM call", () => {
    // Each case uses a valid baseline and mutates exactly one field so the
    // failure reason is unambiguous.
    const valid: BoomPlacement = {
        pivotM: { x: 0, y: 0, z: 0 },
        boomRadiusM: 0.5,
        boomLengthM: 10.0,
        slewDeg: 0,
        elevationDeg: 0,
    };

    test("valid placement does not throw", () => {
        // Baseline: all fields legal → no error.
        expect(() => validateBoomPlacement(valid)).not.toThrow();
    });

    test("boomLengthM = 0 throws RangeError — zero length gives a degenerate boom", () => {
        // Measured: a zero-length cylinder is created with volume 0 and the distance to it
        // is meaningless. The guard must throw before the factory is used.
        expect(() => validateBoomPlacement({ ...valid, boomLengthM: 0 })).toThrow(RangeError);
    });

    test("boomLengthM = −5 throws RangeError — negative length aborts the kernel", () => {
        // Measured: a negative-length cylinder is created, but the distance call then
        // aborts the WASM kernel (RuntimeError "Aborted").
        expect(() => validateBoomPlacement({ ...valid, boomLengthM: -5 })).toThrow(RangeError);
    });

    test("boomLengthM = NaN throws RangeError", () => {
        expect(() => validateBoomPlacement({ ...valid, boomLengthM: NaN })).toThrow(RangeError);
    });

    test("boomRadiusM = 0 throws RangeError — zero radius is not a real boom", () => {
        expect(() => validateBoomPlacement({ ...valid, boomRadiusM: 0 })).toThrow(RangeError);
    });

    test("boomRadiusM = −0.1 throws RangeError", () => {
        expect(() => validateBoomPlacement({ ...valid, boomRadiusM: -0.1 })).toThrow(RangeError);
    });

    test("elevationDeg = 120 throws RangeError — past vertical, physically impossible", () => {
        // 120° > 90°: boom would point backwards past vertical.
        // Without this guard the engine returns a 'SAFE' result that is geometrically wrong
        // (measured: pivot (8, 31, 0), 20 m boom, 120° gave SAFE at 16.6 m from Tower A).
        expect(() => validateBoomPlacement({ ...valid, elevationDeg: 120 })).toThrow(RangeError);
    });

    test("elevationDeg = −10 throws RangeError — below horizontal", () => {
        // A boom pointing below horizontal is not a valid pose for this planner.
        expect(() => validateBoomPlacement({ ...valid, elevationDeg: -10 })).toThrow(RangeError);
    });

    test("slewDeg = NaN throws RangeError — produces NaN direction vector", () => {
        // NaN slew → cos(NaN)=NaN, sin(NaN)=NaN → the XYZ constructor throws "NaN in XYZ"
        // (a plain JS error). The guard gives a clearer message first.
        expect(() => validateBoomPlacement({ ...valid, slewDeg: NaN })).toThrow(RangeError);
    });

    test("slewDeg = Infinity throws RangeError", () => {
        expect(() => validateBoomPlacement({ ...valid, slewDeg: Infinity })).toThrow(RangeError);
    });

    test("pivot.z = NaN throws RangeError — a NaN coordinate is not a valid position", () => {
        expect(() => validateBoomPlacement({ ...valid, pivotM: { x: 0, y: 0, z: NaN } })).toThrow(RangeError);
    });

    test("boundary: elevationDeg = 0 and 90 are both valid", () => {
        // Inclusive bounds: horizontal (0°) and straight-up (90°) are legal.
        expect(() => validateBoomPlacement({ ...valid, elevationDeg: 0 })).not.toThrow();
        expect(() => validateBoomPlacement({ ...valid, elevationDeg: 90 })).not.toThrow();
    });

    test("boundary: slewDeg = −180 and 360 are valid (any finite angle wraps correctly)", () => {
        // Slew has no physical limit — any finite angle is passed through cos/sin safely.
        expect(() => validateBoomPlacement({ ...valid, slewDeg: -180 })).not.toThrow();
        expect(() => validateBoomPlacement({ ...valid, slewDeg: 360 })).not.toThrow();
    });
});

// ===========================================================================
describe("Task M6: statusToColour / isRedFlag — BACKLOG M6 red-highlight rule", () => {
    // BACKLOG M6: "red highlight under the clearance limit, with numeric readout"
    // Both WARNING (below limit, no collision) and CRITICAL (collision) must be red.
    // Only SAFE is green.

    test("SAFE → green, isRedFlag = false", () => {
        // dist ≥ limit → SAFE → green
        expect(statusToColour("SAFE")).toBe("green");
        const r = {
            obstacleId: "x",
            obstacleLabel: "x",
            minDistanceM: 3.0,
            isCollision: false,
            isTouching: false,
            clearanceLimitM: 2.0,
            status: "SAFE" as const,
            disclaimer: "Planning aid, not a certified lift plan." as const,
        };
        expect(isRedFlag(r)).toBe(false);
    });

    test("WARNING → red, isRedFlag = true (dist below limit, no collision)", () => {
        // dist < limit but no penetration → WARNING → red per BACKLOG
        expect(statusToColour("WARNING")).toBe("red");
        const r = {
            obstacleId: "x",
            obstacleLabel: "x",
            minDistanceM: 1.0,
            isCollision: false,
            isTouching: false,
            clearanceLimitM: 2.0,
            status: "WARNING" as const,
            disclaimer: "Planning aid, not a certified lift plan." as const,
        };
        expect(isRedFlag(r)).toBe(true);
    });

    test("CRITICAL → red, isRedFlag = true (collision)", () => {
        // collision → CRITICAL → red
        expect(statusToColour("CRITICAL")).toBe("red");
        const r = {
            obstacleId: "x",
            obstacleLabel: "x",
            minDistanceM: 0,
            isCollision: true,
            isTouching: false,
            clearanceLimitM: 2.0,
            status: "CRITICAL" as const,
            disclaimer: "Planning aid, not a certified lift plan." as const,
        };
        expect(isRedFlag(r)).toBe(true);
    });

    test("null / undefined status → 'none', isRedFlag = false (no false green)", () => {
        // When no obstacles are checked, status is undefined / null.
        // It must NOT report green (which would falsely imply SAFE).
        expect(statusToColour(null)).toBe("none");
        expect(statusToColour(undefined)).toBe("none");
        expect(isRedFlag(null)).toBe(false);
        expect(isRedFlag(undefined)).toBe(false);
    });
});

// ===========================================================================
describe("Task M6: statusFor — minDistanceM validation (safety must-fix)", () => {
    it("throws RangeError for NaN, Infinity and negative distance (never SAFE)", () => {
        expect(() => statusFor(Number.NaN, false, false, 2.0)).toThrow(RangeError);
        expect(() => statusFor(Number.POSITIVE_INFINITY, false, false, 2.0)).toThrow(RangeError);
        expect(() => statusFor(-0.5, false, false, 2.0)).toThrow(RangeError);
        expect(() => statusFor(Number.NaN, true, false, 2.0)).toThrow(RangeError);
    });
    it("still accepts distance 0 and normal values", () => {
        expect(statusFor(0, false, false, 2.0)).toBe("WARNING");
        expect(statusFor(2.0, false, false, 2.0)).toBe("SAFE");
    });
});

describe("Task M6: statusFor — clearanceLimitM validation (safety must-fix)", () => {
    test("clearanceLimitM = NaN throws RangeError — prevents false SAFE", () => {
        expect(() => statusFor(5.0, false, false, Number.NaN)).toThrow(RangeError);
    });

    test("clearanceLimitM < 0 throws RangeError — negative limit is invalid", () => {
        expect(() => statusFor(5.0, false, false, -1.0)).toThrow(RangeError);
        expect(() => statusFor(5.0, false, false, -0.01)).toThrow(RangeError);
    });

    test("clearanceLimitM Infinity throws RangeError", () => {
        expect(() => statusFor(5.0, false, false, Number.POSITIVE_INFINITY)).toThrow(RangeError);
        expect(() => statusFor(5.0, false, false, Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    });

    test("valid clearanceLimitM: collision/touching → CRITICAL, below limit → WARNING, at or above limit → SAFE", () => {
        expect(statusFor(0, true, false, 2.0)).toBe("CRITICAL");
        expect(statusFor(0, false, true, 2.0)).toBe("CRITICAL");
        expect(statusFor(1.0, false, false, 2.0)).toBe("WARNING");
        expect(statusFor(2.0, false, false, 2.0)).toBe("SAFE");
        expect(statusFor(3.0, false, false, 2.0)).toBe("SAFE");
        expect(statusFor(0.5, false, false, 0)).toBe("SAFE");
    });
});

// Returns the result for one obstacle id; fails the test with a clear message if it is missing.
function findResult(report: SiteClearanceReport, id: string): ObstacleClearanceResult {
    const result = report.obstacles.find((r) => r.obstacleId === id);
    if (!result) throw new Error(`no clearance result for obstacle "${id}"`);
    return result;
}

// ===========================================================================
describe("Task M6: buildBuildingSolid & buildPowerLineWall unit tests", () => {
    let factory: ShapeFactory;
    beforeEach(() => {
        factory = new ShapeFactory();
    });

    test("buildBuildingSolid rejects polygons with fewer than 3 vertices", () => {
        expect(() =>
            buildBuildingSolid(factory, {
                id: "bad",
                label: "bad",
                polygon: [
                    [0, 0],
                    [1, 1],
                ],
                height_m: 10,
                clearanceLimitM: 2,
            }),
        ).toThrow("polygon must have ≥ 3 vertices");
    });

    test("buildBuildingSolid extrudes the footprint to full height (volume = area x height)", () => {
        // Tower A: 40 m x 22 m footprint, 75 m high = 66 000 m3. The kernel works in mm.
        const solid = buildBuildingSolid(factory, TOWER_A);
        const expectedMm3 = 40 * 22 * 75 * MM_PER_M ** 3;
        expect(Math.abs(solid.volume() - expectedMm3) / expectedMm3).toBeLessThan(1e-6);
    });

    test("buildPowerLineWall builds a flat 400 m x 200 m face at x = x_m", () => {
        const wall = buildPowerLineWall(factory, POWER_LINE);

        // Area: 400 m (Y) x 200 m (Z) = 80 000 m2, in mm2 for the kernel.
        const expectedMm2 = 400 * 200 * MM_PER_M ** 2;
        expect(Math.abs(wall.area() - expectedMm2) / expectedMm2).toBeLessThan(1e-6);

        // Flat: both X limits sit at x_m (-9.0 m = -9000 mm).
        const box = wall.boundingBox();
        expect(box.min.x).toBeCloseTo(POWER_LINE.x_m * MM_PER_M, 3);
        expect(box.max.x).toBeCloseTo(POWER_LINE.x_m * MM_PER_M, 3);
    });
});

// ===========================================================================
describe("Task M6: checkOneClearance — boom vs Tower A", () => {
    let factory: ShapeFactory;
    beforeEach(() => {
        factory = new ShapeFactory();
    });

    test("Case 1: 3.0 m safe clearance from Tower A west face — SAFE", () => {
        // Hand calculation:
        // Crane pivot: x=10.0 m, slew=0° (east), elevation=0° (horizontal).
        // Boom length = 12.0 m, radius = 0.5 m.
        // OCCT cylinder: the flat end-disc is at x = pivot.x + boomLength = 10.0 + 12.0 = 22.0 m.
        // The cylinder radius (0.5 m) acts only PERPENDICULAR to the axis (Y and Z), NOT along +X.
        // So the nearest boom surface to Tower A is the flat end-disc at x = 22.0 m.
        // Tower A west face = 25.0 m (footprint x0=25).
        // Gap = 25.0 − 22.0 = 3.0 m exactly.
        // Kernel confirmed: extremaDistance returns 3000 mm = 3.0 m.
        const boom = buildBoomSolid(factory, safePlacement({ boomLengthM: 12.0, boomRadiusM: 0.5 }));
        const building = buildBuildingSolid(factory, TOWER_A);
        const result = checkOneClearance(boom, building, TOWER_A, factory);

        expect(result.isCollision).toBe(false);
        expect(result.isTouching).toBe(false);
        expect(result.minDistanceM).toBeCloseTo(3.0, 1); // kernel: 3.0 m
        expect(result.status).toBe("SAFE");
        expect(result.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Case 2: boom penetrates Tower A — CRITICAL collision", () => {
        // Hand calculation:
        // Crane pivot: x=10.0 m, slew=0°, elevation=0°.
        // Boom length = 20.0 m, radius = 0.5 m.
        // OCCT cylinder: flat end-disc at x = 10.0 + 20.0 = 30.0 m.
        // Tower A spans X=[25, 65]. End-disc at 30 m is inside Tower A (30 > 25).
        // → collision expected.
        const boom = buildBoomSolid(factory, safePlacement({ boomLengthM: 20.0 }));
        const building = buildBuildingSolid(factory, TOWER_A);
        const result = checkOneClearance(boom, building, TOWER_A, factory);

        expect(result.isCollision).toBe(true);
        expect(result.minDistanceM).toBe(0);
        expect(result.status).toBe("CRITICAL");
        expect(result.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Case 3: boom tip exactly at Tower A west face — touching/CRITICAL", () => {
        // Hand calculation:
        // Pivot x=12.0 m, boom length=13.0 m, radius=0.05 m (thin), slew=0°, elevation=0°.
        // OCCT cylinder: flat end-disc at x = 12.0 + 13.0 = 25.0 m = Tower A west face exactly.
        // Touching (distance = 0) → CRITICAL.
        const boom = buildBoomSolid(
            factory,
            safePlacement({ pivotM: { x: 12.0, y: 31.0, z: 0 }, boomLengthM: 13.0, boomRadiusM: 0.05 }),
        );
        const building = buildBuildingSolid(factory, TOWER_A);
        const result = checkOneClearance(boom, building, TOWER_A, factory);

        expect(result.minDistanceM).toBeLessThan(0.1);
        expect(result.status).toBe("CRITICAL");
    });

    test("Case 4: WARNING zone — boom end-disc 1.0 m from Tower A", () => {
        // Hand calculation:
        // Pivot x=16.0 m, boom length=8.0 m, radius=0.5 m, slew=0° (east), elevation=0°.
        // OCCT cylinder: flat end-disc at x = 16.0 + 8.0 = 24.0 m.
        // Radius (0.5 m) is perpendicular to axis — it does NOT add along +X.
        // Tower A west face = 25.0 m.
        // Gap = 25.0 − 24.0 = 1.0 m < clearance limit (2.0 m) → WARNING.
        // Kernel confirmed: extremaDistance returns 1000 mm = 1.0 m.
        const boom = buildBoomSolid(
            factory,
            safePlacement({ pivotM: { x: 16.0, y: 31.0, z: 0 }, boomLengthM: 8.0, boomRadiusM: 0.5 }),
        );
        const building = buildBuildingSolid(factory, TOWER_A);
        const result = checkOneClearance(boom, building, TOWER_A, factory);

        expect(result.isCollision).toBe(false);
        expect(result.minDistanceM).toBeCloseTo(1.0, 1); // kernel: 1.0 m
        expect(result.status).toBe("WARNING");
    });

    test("Case 5: Boundary case — distance exactly equal to clearance limit (2.0 m) → SAFE", () => {
        // Hand calculation:
        // Pivot x=15.0 m, boom length=8.0 m, radius=0.5 m, slew=0° (east), elevation=0°.
        // Flat end-disc at x = 15.0 + 8.0 = 23.0 m.
        // Tower A west face = 25.0 m.
        // Gap = 25.0 − 23.0 = 2.0 m == clearanceLimitM (2.0 m).
        // Since distance is not strictly less than limit, status is SAFE.
        const boom = buildBoomSolid(
            factory,
            safePlacement({ pivotM: { x: 15.0, y: 31.0, z: 0 }, boomLengthM: 8.0, boomRadiusM: 0.5 }),
        );
        const building = buildBuildingSolid(factory, TOWER_A);
        const result = checkOneClearance(boom, building, TOWER_A, factory);

        expect(result.isCollision).toBe(false);
        expect(result.minDistanceM).toBeCloseTo(2.0, 1);
        expect(result.status).toBe("SAFE");
    });

    test("invalid obstacle clearanceLimitM (NaN or negative) throws RangeError through checkOneClearance", () => {
        const boom = buildBoomSolid(factory, safePlacement());
        const building = buildBuildingSolid(factory, TOWER_A);
        expect(() =>
            checkOneClearance(boom, building, { ...TOWER_A, clearanceLimitM: Number.NaN }, factory),
        ).toThrow(RangeError);
        expect(() =>
            checkOneClearance(boom, building, { ...TOWER_A, clearanceLimitM: -1.0 }, factory),
        ).toThrow(RangeError);
    });
});

// ===========================================================================
describe("Task M6: computeSiteClearance — full site check", () => {
    let factory: ShapeFactory;
    beforeEach(() => {
        factory = new ShapeFactory();
    });

    test("BACKLOG.md acceptance: tilted boom 20 m, elevation 30°, pivot (5,31,0) — hand-computed 2.43 m from Tower A", () => {
        // BACKLOG.md: "crane at a stated position and boom 20 m at stated angle:
        // min distance to Tower A equals a hand-computed value (±0.1 m)"
        //
        // Setup: pivot (5, 31, 0) m, boom 20 m, slew=0° (east), elevation=30°, radius=0.5 m.
        //
        // Hand calculation (verified step by step):
        //   Boom axis direction d = (cos30°, 0, sin30°) = (0.8660, 0, 0.5000).
        //   Boom tip centre = pivot + 20·d = (5+17.321, 31, 0+10.000) = (22.321, 31, 10.000) m.
        //
        //   The cylinder radius acts only perpendicular to the axis.
        //   The perpendicular direction in the XZ plane that maximises +X reach:
        //     perp_X = (sin30°, 0, −cos30°) = (0.5, 0, −0.866) — rotated 90° from axis in XZ.
        //     X-component of perp_X = 0.5.
        //   Nearest boom surface x = tip_x + R·sin(elevation) = 22.321 + 0.5·0.5 = 22.571 m.
        //
        //   Tower A west face at x = 25.0 m; Y=[20,42]; Z=[0,75].
        //   The point (22.571, 31, 9.567) on the boom has y=31 ∈ [20,42] and z≈9.6 ∈ [0,75].
        //   → nearest obstacle surface is Tower A west face.
        //
        //   Gap = 25.000 − 22.571 = 2.429 m ≈ 2.43 m (±0.1 m).
        //   Limit = 2.0 m → status = SAFE.
        //
        // Note: this pose also hits the Podium (x 15..75, z 0..9): at x = 15 the boom axis is at
        // z = 10 / cos30° × sin30° = 5.77 m, inside the Podium. The Podium result is a collision
        // (distance 0). This test only checks Tower A.
        const placement: BoomPlacement = {
            pivotM: { x: 5, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 20.0,
            slewDeg: 0,
            elevationDeg: 30,
        };
        const report = computeSiteClearance(factory, placement, [TOWER_A, PODIUM, TOWER_B], POWER_LINE);

        const towerA = findResult(report, "tower_a");
        expect(towerA.isCollision).toBe(false);
        expect(towerA.minDistanceM).toBeCloseTo(2.43, 1); // hand-computed: 2.43 m ± 0.1 m
        expect(towerA.status).toBe("SAFE");
        expect(report.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Safe placement: boom 10 m east from x=5 m — Tower A is 10.0 m away (SAFE)", () => {
        // Hand calculation:
        // Pivot at (5, 31, 0), boom 10 m east, radius 0.5 m, slew=0°, elevation=0°.
        // OCCT cylinder: flat end-disc at x = 5.0 + 10.0 = 15.0 m.
        // Radius (0.5 m) perpendicular to axis — does NOT add along +X.
        // Tower A west face = 25.0 m.
        // Gap = 25.0 − 15.0 = 10.0 m exactly.
        // Kernel confirmed: extremaDistance returns 10000 mm = 10.0 m.
        // Power line: thin wall at x = −9 m. Pivot base (nearest end) at x = 5 m.
        // Gap to wire = 5 − (−9) = 14.0 m > clearance limit 6.0 m → SAFE.
        // (Not asserted in this test: the power line result is checked in the power-line tests below.)
        const placement: BoomPlacement = {
            pivotM: { x: 5, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 10.0,
            slewDeg: 0,
            elevationDeg: 0,
        };
        const report = computeSiteClearance(factory, placement, [TOWER_A, TOWER_B], POWER_LINE);

        expect(report.anyCollision).toBe(false);
        const towerA = findResult(report, "tower_a");
        expect(towerA.status).toBe("SAFE");
        expect(towerA.minDistanceM).toBeCloseTo(10.0, 1); // kernel: 10.0 m
        expect(report.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Power line: boom aimed west, tip 2.0 m from wire — WARNING", () => {
        // Hand calculation:
        // Power line at x = −9.0 m (thin vertical wall).
        // Pivot at (3, 31, 0), boom 10 m west (slew=180°, elevation=0°).
        // Direction: (cos180°, 0, 0) = (−1, 0, 0).
        // Boom tip centre x = 3 + 10×(−1) = −7.0 m.
        // Cylinder radius (0.5 m) is perpendicular to axis (along Y/Z), does NOT add along −X.
        // Nearest boom surface x = −7.0 m (flat end-disc).
        // Wire face at x = −9.0 m.
        // Gap = |−7.0 − (−9.0)| = 2.0 m — boom tip is 2.0 m east of the wire.
        // clearanceLimitM = 6.0 m → 2.0 < 6.0 → WARNING (not collision; no penetration).
        const placement: BoomPlacement = {
            pivotM: { x: 3, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 10.0,
            slewDeg: 180,
            elevationDeg: 0,
        };
        const report = computeSiteClearance(factory, placement, [], POWER_LINE);

        const pl = findResult(report, "power_line");
        expect(pl.isCollision).toBe(false);
        expect(pl.minDistanceM).toBeCloseTo(2.0, 1); // kernel: 2.0 m
        expect(pl.status).toBe("WARNING");
        expect(report.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Power line: boom tip at wire — CRITICAL (touching)", () => {
        // Hand calculation:
        // Pivot at (0, 31, 0), boom 9 m west (slew=180°, elevation=0°).
        // Boom tip centre x = 0 − 9 = −9.0 m = wire position exactly → touching → CRITICAL.
        // The wall has no volume, so the engine reports touching (isCollision = false,
        // isTouching = true), not a collision. anyCollision is true for either.
        const placement: BoomPlacement = {
            pivotM: { x: 0, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 9.0,
            slewDeg: 180,
            elevationDeg: 0,
        };
        const report = computeSiteClearance(factory, placement, [], POWER_LINE);

        const pl = findResult(report, "power_line");
        expect(pl.status).toBe("CRITICAL");
        expect(report.anyCollision).toBe(true);
        expect(report.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Power line: boom pointing away from the wire, 14.0 m gap — SAFE", () => {
        // Hand calculation:
        // Power line at x = −9.0 m (thin wall).
        // Pivot at (5, 31, 0), boom 10 m east (slew=0°): the boom runs from x = 5 m to x = 15 m,
        // away from the wire. The nearest boom surface is the flat base disc at x = 5 m
        // (the radius acts only perpendicular to the axis).
        // Gap = 5 − (−9) = 14.0 m.
        // clearanceLimitM = 6.0 m → 14.0 > 6.0 → SAFE.
        const placement: BoomPlacement = {
            pivotM: { x: 5, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 10.0,
            slewDeg: 0,
            elevationDeg: 0,
        };
        const report = computeSiteClearance(factory, placement, [], POWER_LINE);

        const pl = findResult(report, "power_line");
        expect(pl.isCollision).toBe(false);
        expect(pl.minDistanceM).toBeCloseTo(14.0, 1); // pivot base at x=5, wire at x=−9 → 14.0 m
        expect(pl.status).toBe("SAFE");
        expect(report.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Elevated boom (elevation=70°) at ground level (z=0) clears Podium (9 m) — not a collision", () => {
        // Hand calculation:
        // Crane pivot at ground level (z=0): (10, 31, 0) m.
        // Boom length = 20 m, radius = 0.5 m, elevation = 70°, slew = 0° (east).
        // Podium spans X=[15, 75], Y=[12, 50], Z=[0, 9] m.
        // Horizontal distance from pivot (x=10) to Podium west face (x=15) is dx = 5 m.
        // Boom axis enters x=15 column at s = 5 / cos(70°) = 5 / 0.34202 = 14.62 m.
        // Height of axis at x=15: z = 14.62 × sin(70°) = 13.74 m > 9.0 m (Podium roof).
        // Boom passes over the Podium corner at (15, 31, 9).
        // Closest point on boom axis to corner (15, 31, 9):
        //   s_proj = 5×cos(70°) + 9×sin(70°) = 1.710 + 8.457 = 10.167 m.
        //   Axis point = (10 + 10.167×0.342, 31, 10.167×0.940) = (13.48, 31, 9.55) m.
        //   Distance to corner = √((15−13.48)² + (9−9.55)²) = √(1.52² + (−0.55)²) = 1.62 m.
        //   Surface distance = 1.62 − 0.5 (radius) ≈ 1.12 m (±0.1 m).
        // Verified: no collision (isCollision = false) despite boom spanning over roof.
        const placement: BoomPlacement = {
            pivotM: { x: 10, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 20.0,
            slewDeg: 0,
            elevationDeg: 70,
        };
        const report = computeSiteClearance(factory, placement, [PODIUM]);

        const podium = findResult(report, "podium");
        expect(podium.isCollision).toBe(false);
        expect(podium.minDistanceM).toBeCloseTo(1.12, 1);
        expect(report.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Empty site: report.worstCase is null, not undefined; no false SAFE verdict", () => {
        // When no obstacles are loaded on the site, computeSiteClearance returns
        // worstCase: null (not undefined) and does NOT report a false SAFE verdict.
        const placement: BoomPlacement = {
            pivotM: { x: 10, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 10.0,
            slewDeg: 0,
            elevationDeg: 0,
        };
        const report = computeSiteClearance(factory, placement, []);

        expect(report.obstacles).toHaveLength(0);
        expect(report.worstCase).toBeNull();
        expect(report.anyCollision).toBe(false);
        expect(report.worstCase?.status).toBeUndefined();
        expect(statusToColour(report.worstCase?.status)).toBe("none");
        expect(isRedFlag(report.worstCase)).toBe(false);
        expect(report.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Report is sorted: CRITICAL before WARNING before SAFE", () => {
        // Place boom so it clashes with one building and is safe from others.
        // Tower A collision (boom 20 m east from x=10) but safe from Tower B (north).
        const placement: BoomPlacement = {
            pivotM: { x: 10, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 20.0,
            slewDeg: 0,
            elevationDeg: 0,
        };
        const report = computeSiteClearance(factory, placement, [TOWER_A, TOWER_B]);

        const statuses = report.obstacles.map((r) => r.status);
        const severityOf = (s: string) => (s === "CRITICAL" ? 0 : s === "WARNING" ? 1 : 2);
        for (let i = 1; i < statuses.length; i++) {
            expect(severityOf(statuses[i])).toBeGreaterThanOrEqual(severityOf(statuses[i - 1]));
        }
    });
});

// ===========================================================================
describe("Task M6: obstacle input validation — rejected before the kernel", () => {
    let factory: ShapeFactory;
    beforeEach(() => {
        factory = new ShapeFactory();
    });

    // A copy of Tower A with one field changed.
    const building = (overrides: Partial<ObstacleFootprint>): ObstacleFootprint => ({
        ...TOWER_A,
        ...overrides,
    });

    test("building height must be finite and > 0 (zero, negative, NaN, Infinity)", () => {
        // The sample site has supply zones with height_m = 0. Without a check, a negative
        // height extruded the building below ground and reported a false SAFE.
        for (const height_m of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() =>
                computeSiteClearance(factory, safePlacement(), [building({ id: "rebar_yard", height_m })]),
            ).toThrow(RangeError);
        }
    });

    test("the error names the obstacle and the field", () => {
        expect(() =>
            computeSiteClearance(factory, safePlacement(), [building({ id: "rebar_yard", height_m: 0 })]),
        ).toThrow(/rebar_yard.*height_m/);
    });

    test("polygon coordinates must be finite", () => {
        const withBadVertex = (x: number, y: number) =>
            building({
                polygon: [
                    [25, 20],
                    [x, y],
                    [65, 42],
                    [25, 42],
                ],
            });
        expect(() => computeSiteClearance(factory, safePlacement(), [withBadVertex(Number.NaN, 20)])).toThrow(
            RangeError,
        );
        expect(() =>
            computeSiteClearance(factory, safePlacement(), [withBadVertex(65, Number.POSITIVE_INFINITY)]),
        ).toThrow(RangeError);
    });

    test("polygon with fewer than 3 vertices throws RangeError", () => {
        expect(() =>
            computeSiteClearance(factory, safePlacement(), [
                building({
                    polygon: [
                        [0, 0],
                        [1, 1],
                    ],
                }),
            ]),
        ).toThrow(RangeError);
    });

    test("building clearanceLimitM must be finite and >= 0", () => {
        for (const clearanceLimitM of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
            expect(() =>
                computeSiteClearance(factory, safePlacement(), [building({ clearanceLimitM })]),
            ).toThrow(RangeError);
        }
    });

    test("power line x_m must be finite", () => {
        for (const x_m of [Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => computeSiteClearance(factory, safePlacement(), [], { ...POWER_LINE, x_m })).toThrow(
                RangeError,
            );
        }
    });

    test("power line clearanceLimitM must be finite and >= 0", () => {
        for (const clearanceLimitM of [Number.NaN, -6]) {
            expect(() =>
                computeSiteClearance(factory, safePlacement(), [], { ...POWER_LINE, clearanceLimitM }),
            ).toThrow(RangeError);
        }
    });

    test("one invalid obstacle rejects the whole call, even when it is not the first", () => {
        expect(() =>
            computeSiteClearance(factory, safePlacement(), [TOWER_A, building({ id: "bad", height_m: -1 })]),
        ).toThrow(RangeError);
    });

    test("checkOneClearance rejects an invalid limit before it calls the kernel", () => {
        // The shapes and the factory are placeholders. If the kernel were called first,
        // this would throw a TypeError instead of the RangeError.
        const notUsed = {} as never;
        expect(() =>
            checkOneClearance(
                notUsed,
                notUsed,
                { id: "x", label: "x", clearanceLimitM: Number.NaN },
                notUsed,
            ),
        ).toThrow(RangeError);
        expect(() =>
            checkOneClearance(notUsed, notUsed, { id: "x", label: "x", clearanceLimitM: -1 }, notUsed),
        ).toThrow(RangeError);
    });

    test("valid sample-site obstacles are still accepted", () => {
        const report = computeSiteClearance(factory, safePlacement(), [TOWER_A, PODIUM, TOWER_B], POWER_LINE);
        expect(report.obstacles).toHaveLength(4);
    });
});
