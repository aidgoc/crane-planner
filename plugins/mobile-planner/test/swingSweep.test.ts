// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Acceptance Tests for Task M7: Swing sweep clearance
// Owner: Abhishek
// ============================================================================

import type { IShapeFactory } from "@chili3d/core";
import { ShapeFactory } from "@chili3d/wasm";
import {
    type BoomPlacement,
    computeSiteClearance,
    type ObstacleFootprint,
    type PowerLineObstacle,
} from "../src/clearance/siteClearance";
import {
    betweenSamplesAllowanceM,
    generateSlewAngles,
    MAX_SWEEP_SAMPLES,
    sweepSlew,
    validateSweepParams,
} from "../src/clearance/swingSweep";
import "./setup";

// ---------------------------------------------------------------------------
// Sample-site obstacle definitions from public/sample-site/sample-site.json.
// All coordinates in metres; X = east, Y = north.
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

const POWER_LINE: PowerLineObstacle = {
    id: "power_line",
    label: "22 kV overhead power line (x = −9 m) — clearance INDICATIVE",
    x_m: -9.0,
    clearanceLimitM: 6.0,
};

// ---------------------------------------------------------------------------
// Wraps a factory to count the solids it creates and how often each one is disposed.
// Tracks cylinder (boom), prism (building) and booleanCommon (overlap test) results.
// ---------------------------------------------------------------------------
function trackingFactory(real: IShapeFactory) {
    const tracked: Array<{ kind: string; disposed: number }> = [];
    const calls: Record<string, number> = {};
    const factory = new Proxy(real, {
        get(target, prop) {
            const value = Reflect.get(target, prop, target);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
                const name = String(prop);
                calls[name] = (calls[name] ?? 0) + 1;
                const result = value.apply(target, args);
                if (
                    ["cylinder", "prism", "booleanCommon"].includes(name) &&
                    result?.isOk &&
                    typeof result.value?.dispose === "function"
                ) {
                    const record = { kind: name, disposed: 0 };
                    tracked.push(record);
                    const original = result.value.dispose;
                    result.value.dispose = () => {
                        record.disposed++;
                        original();
                    };
                }
                return result;
            };
        },
    }) as IShapeFactory;
    return { factory, tracked, calls };
}

// ===========================================================================
// Unit tests: validateSweepParams & generateSlewAngles
// ===========================================================================
describe("Task M7: validateSweepParams input guard", () => {
    const validPlacement: BoomPlacement = {
        pivotM: { x: 5, y: 10, z: 0 },
        boomRadiusM: 0.5,
        boomLengthM: 15.0,
        slewDeg: 0,
        elevationDeg: 0,
    };

    test("valid inputs do not throw", () => {
        expect(() => validateSweepParams(validPlacement, 0, 90, 5)).not.toThrow();
        expect(() => validateSweepParams(validPlacement, 90, 0, 2)).not.toThrow();
        expect(() => validateSweepParams(validPlacement, 45, 45, 1)).not.toThrow();
    });

    test("stepDeg <= 0 throws RangeError", () => {
        expect(() => validateSweepParams(validPlacement, 0, 90, 0)).toThrow(RangeError);
        expect(() => validateSweepParams(validPlacement, 0, 90, -2)).toThrow(RangeError);
    });

    test("stepDeg non-finite throws RangeError", () => {
        expect(() => validateSweepParams(validPlacement, 0, 90, Number.NaN)).toThrow(RangeError);
        expect(() => validateSweepParams(validPlacement, 0, 90, Number.POSITIVE_INFINITY)).toThrow(
            RangeError,
        );
    });

    test("fromDeg or toDeg non-finite throws RangeError", () => {
        expect(() => validateSweepParams(validPlacement, Number.NaN, 90, 5)).toThrow(RangeError);
        expect(() => validateSweepParams(validPlacement, 0, Number.POSITIVE_INFINITY, 5)).toThrow(RangeError);
    });

    test("invalid BoomPlacement (e.g. boomLengthM <= 0) throws RangeError", () => {
        const badPlacement = { ...validPlacement, boomLengthM: -5 };
        expect(() => validateSweepParams(badPlacement, 0, 90, 5)).toThrow(RangeError);
    });

    test("a step that needs more than MAX_SWEEP_SAMPLES angles throws RangeError before any geometry", () => {
        // 0.0001 degrees over 90 degrees would be 900,001 kernel checks.
        expect(() => validateSweepParams(validPlacement, 0, 90, 0.0001)).toThrow(RangeError);
        expect(() => validateSweepParams(validPlacement, 0, 90, 0.0001)).toThrow(/samples/);
        // A huge range with a normal step is also rejected.
        expect(() => validateSweepParams(validPlacement, 0, 1e9, 1)).toThrow(RangeError);
    });

    test("the largest sensible sweeps are still accepted: 0 to 360 degrees at 0.1 degrees", () => {
        expect(MAX_SWEEP_SAMPLES).toBe(5000);
        expect(() => validateSweepParams(validPlacement, 0, 360, 0.1)).not.toThrow();
        expect(() => validateSweepParams(validPlacement, 0, 90, 2)).not.toThrow();
    });
});

describe("Task M7: generateSlewAngles is safe to call on its own (review: zero, negative, NaN step)", () => {
    test("step 0 throws RangeError instead of looping forever", () => {
        expect(() => generateSlewAngles(0, 90, 0)).toThrow(RangeError);
    });

    test("negative, NaN and infinite steps throw RangeError instead of returning an empty list", () => {
        expect(() => generateSlewAngles(0, 90, -5)).toThrow(RangeError);
        expect(() => generateSlewAngles(0, 90, Number.NaN)).toThrow(RangeError);
        expect(() => generateSlewAngles(0, 90, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });

    test("non-finite angles throw RangeError", () => {
        expect(() => generateSlewAngles(Number.NaN, 90, 5)).toThrow(RangeError);
        expect(() => generateSlewAngles(0, Number.POSITIVE_INFINITY, 5)).toThrow(RangeError);
    });

    test("a step that needs too many samples throws before the list is built", () => {
        expect(() => generateSlewAngles(0, 90, 0.0001)).toThrow(/samples/);
        expect(() => generateSlewAngles(0, 1e9, 1)).toThrow(RangeError);
    });

    test("an angle list never comes back empty", () => {
        for (const [from, to, step] of [
            [0, 90, 5],
            [90, 0, 5],
            [10, 10, 5],
            [0, 0.001, 2],
        ] as const) {
            expect(generateSlewAngles(from, to, step).length).toBeGreaterThan(0);
        }
    });
});

describe("Task M7: MAX_SWEEP_SAMPLES boundary (review)", () => {
    const placement: BoomPlacement = {
        pivotM: { x: 0, y: 0, z: 0 },
        boomRadiusM: 0.5,
        boomLengthM: 10,
        slewDeg: 0,
        elevationDeg: 0,
    };

    test("exactly MAX_SWEEP_SAMPLES angles is accepted, one more is rejected", () => {
        // 0 to 4999 in steps of 1 is exactly 5000 angles.
        expect(generateSlewAngles(0, MAX_SWEEP_SAMPLES - 1, 1)).toHaveLength(MAX_SWEEP_SAMPLES);
        expect(() => validateSweepParams(placement, 0, MAX_SWEEP_SAMPLES - 1, 1)).not.toThrow();
        // 0 to 5000 in steps of 1 is 5001 angles.
        expect(() => generateSlewAngles(0, MAX_SWEEP_SAMPLES, 1)).toThrow(RangeError);
        expect(() => validateSweepParams(placement, 0, MAX_SWEEP_SAMPLES, 1)).toThrow(RangeError);
        // 0 to 4999.5 in steps of 1 needs the end angle on top of 0..4999, so 5001 angles.
        expect(() => generateSlewAngles(0, MAX_SWEEP_SAMPLES - 0.5, 1)).toThrow(RangeError);
    });
});

describe("Task M7: endpoint is always sampled (review)", () => {
    test("a very small non-zero sweep still includes the end angle", () => {
        expect(generateSlewAngles(0, 1e-10, 2)).toEqual([0, 1e-10]);
        expect(generateSlewAngles(0, 1e-12, 5)).toEqual([0, 1e-12]);
        expect(generateSlewAngles(5, 5 - 1e-11, 2)).toEqual([5, 5 - 1e-11]);
    });

    test("the last angle is exactly toDeg, also with rounding in the steps", () => {
        const angles = generateSlewAngles(0, 0.3, 0.1);
        expect(angles).toHaveLength(4);
        expect(angles[angles.length - 1]).toBe(0.3);
        const back = generateSlewAngles(90, 0, 30);
        expect(back[back.length - 1]).toBe(0);
    });
});

describe("Task M7: generateSlewAngles", () => {
    test("forward sweep: 0° to 90° with step 30° → [0, 30, 60, 90]", () => {
        const angles = generateSlewAngles(0, 90, 30);
        expect(angles).toEqual([0, 30, 60, 90]);
    });

    test("forward sweep with non-divisible range includes endpoint: 0° to 90° with step 40° → [0, 40, 80, 90]", () => {
        const angles = generateSlewAngles(0, 90, 40);
        expect(angles).toEqual([0, 40, 80, 90]);
    });

    test("reverse sweep: 90° to 0° with step 30° → [90, 60, 30, 0]", () => {
        const angles = generateSlewAngles(90, 0, 30);
        expect(angles).toEqual([90, 60, 30, 0]);
    });

    test("angles are not wrapped: 0° to 270° sweeps the full 270°, not the short 90° the other way", () => {
        const angles = generateSlewAngles(0, 270, 90);
        expect(angles).toEqual([0, 90, 180, 270]);
    });

    test("angles are not wrapped: 350° to 10° sweeps 340° downwards, not 20° through 0°", () => {
        const angles = generateSlewAngles(350, 10, 10);
        expect(angles).toHaveLength(35);
        expect(angles[0]).toBe(350);
        expect(angles[34]).toBe(10);
        expect(angles).not.toContain(0);
    });

    test("single angle: 45° to 45° → [45]", () => {
        const angles = generateSlewAngles(45, 45, 5);
        expect(angles).toEqual([45]);
    });

    test("step 2° over 0°..90° gives 46 samples", () => {
        const angles = generateSlewAngles(0, 90, 2);
        expect(angles).toHaveLength(46);
        expect(angles[0]).toBe(0);
        expect(angles[45]).toBe(90);
    });

    test("step 5° over 0°..90° gives 19 samples", () => {
        const angles = generateSlewAngles(0, 90, 5);
        expect(angles).toHaveLength(19);
        expect(angles[0]).toBe(0);
        expect(angles[18]).toBe(90);
    });
});

// ===========================================================================
// Full integration tests: sweepSlew
// ===========================================================================
describe("Task M7: sweepSlew clearance integration", () => {
    let factory: ShapeFactory;
    beforeEach(() => {
        factory = new ShapeFactory();
    });

    test("empty site returns worstStep === null, no false SAFE", () => {
        const placement: BoomPlacement = {
            pivotM: { x: 10, y: 10, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 10.0,
            slewDeg: 0,
            elevationDeg: 0,
        };
        const sweep = sweepSlew(factory, placement, 0, 90, 10, []);
        expect(sweep.sampleCount).toBe(10);
        expect(sweep.worstStep).toBeNull();
        expect(sweep.anyCollision).toBe(false);
        expect(sweep.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("BACKLOG.md acceptance: Pick at 0° and set at 90°, worst-case angle and distance reported, step 2° vs 5° diff < 10 cm", () => {
        // -------------------------------------------------------------------
        // BACKLOG.md M7 Acceptance Criterion:
        // "Pick at 0 deg and set at 90 deg: worst-case angle and distance reported;
        //  changing step size changes the answer by less than the 10 cm tolerance"
        // -------------------------------------------------------------------
        //
        // Setup / Geometry:
        // - Crane pivot placed at (x0, y0, z0) = (10, 10, 0) m
        // - Boom length L = 12.0 m, boom radius R = 0.5 m, elevation = 0° (horizontal)
        // - Tower A southwest corner is at (25, 20), extending to (65, 42), height 75 m.
        //   clearanceLimitM = 2.0 m.
        // - Slew sweeps from pick = 0° (East) to set = 90° (North).
        //
        // Hand calculation (verified step-by-step):
        // 1. Vector from pivot (10, 10) to Tower A SW corner (25, 20):
        //      dx = 25 - 10 = 15 m
        //      dy = 20 - 10 = 10 m
        //      Distance to corner = sqrt(15^2 + 10^2) = sqrt(225 + 100) = sqrt(325) ≈ 18.028 m.
        //      Angle to corner theta_corner = atan2(10, 15) = atan(2/3) ≈ 33.690°.
        //
        // 2. Boom tip position at slew angle theta:
        //      x_tip = 10 + 12*cos(theta)
        //      y_tip = 10 + 12*sin(theta)
        //    Since L = 12 m < 18.028 m, the boom tip never reaches the corner.
        //
        // 3. Distance behavior:
        //    - At theta = 0° (East):
        //        x_tip = 22 m, y_tip = 10 m.
        //        Tower A nearest point is SW corner (25, 20) or south face y=20 (x in [25,65]).
        //        Closest point on Tower A is (25, 20).
        //        Distance from boom axis/tip (22, 10) to (25, 20) is sqrt((25-22)^2 + (20-10)^2)
        //        = sqrt(9 + 100) = sqrt(109) ≈ 10.440 m.
        //        With cylinder boundary (radius 0.5 m), surface distance ≈ 9.94 m.
        //
        //    - At theta = 90° (North):
        //        x_tip = 10 m, y_tip = 22 m.
        //        Tower A west face is at x = 25 m (y in [20, 42]).
        //        The boom is parallel to the west face along x = 10 m.
        //        Distance from boom axis (x=10) to west face (x=25) is 25 - 10 = 15.000 m.
        //        Surface distance = 15.0 - 0.5 = 14.500 m.
        //
        //    - Pointing straight at the corner, theta_corner = atan2(10, 15) = 33.690°:
        //        the centre of the flat boom end faces the corner, so
        //        distance = D - L = 18.028 - 12.000 = 6.028 m.
        //    - The smallest distance is NOT there. The boom is a cylinder, so the
        //      rim of its flat end, r = 0.5 m sideways from the axis, is
        //        sqrt(L^2 + r^2) = sqrt(144.25) = 12.0104 m from the pivot.
        //      Turn the boom by atan(r / L) = atan(0.5 / 12) = 2.39 degrees to
        //      either side of the corner direction and that rim point lies on the
        //      line to the corner:
        //        distance = D - sqrt(L^2 + r^2) = 18.0278 - 12.0104 = 6.0173 m
        //      at theta = 33.69 - 2.39 = 31.30 degrees and at
        //      theta = 33.69 + 2.39 = 36.08 degrees (two equal minima).
        //
        //    -> The WORST clearance is at an INTERMEDIATE angle (about 31.3 or
        //       36.1 degrees), NOT at the 0 or 90 degree endpoints.
        //
        // 4. Step size comparison (2 vs 5 degrees), kernel values:
        //    - 2 degree step samples 36 degrees (0.08 degrees from 36.08): 6.0174 m.
        //    - 5 degree step samples 35 degrees (1.08 degrees from 36.08): 6.0230 m.
        //    - 0.25 degree step (reference, not in this test) finds 31.25 degrees: 6.0174 m.
        //    |distance(2) - distance(5)| = 0.0056 m, well inside the 0.10 m tolerance.
        // -------------------------------------------------------------------

        const placement: BoomPlacement = {
            pivotM: { x: 10, y: 10, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 12.0,
            slewDeg: 0,
            elevationDeg: 0,
        };

        // Run with 2° step
        const sweep2 = sweepSlew(factory, placement, 0, 90, 2, [TOWER_A]);
        expect(sweep2.worstStep).not.toBeNull();
        const worst2 = sweep2.worstStep!;

        // Run with 5° step
        const sweep5 = sweepSlew(factory, placement, 0, 90, 5, [TOWER_A]);
        expect(sweep5.worstStep).not.toBeNull();
        const worst5 = sweep5.worstStep!;

        // Both find a worst angle next to one of the two minima (31.3 or 36.1 degrees).
        expect(worst2.slewDeg).toBeGreaterThanOrEqual(30);
        expect(worst2.slewDeg).toBeLessThanOrEqual(37);

        expect(worst5.slewDeg).toBeGreaterThanOrEqual(30);
        expect(worst5.slewDeg).toBeLessThanOrEqual(37);

        // Hand calculation: D - sqrt(L^2 + r^2) = 18.0278 - 12.0104 = 6.0173 m.
        expect(worst2.result.minDistanceM).toBeCloseTo(Math.hypot(15, 10) - Math.hypot(12, 0.5), 2);

        // Tolerance check from BACKLOG.md:
        // "changing step size changes the answer by less than the 10 cm tolerance"
        const distanceDiff = Math.abs(worst2.result.minDistanceM - worst5.result.minDistanceM);
        expect(distanceDiff).toBeLessThan(0.1); // < 10 cm tolerance

        // Status is SAFE because 5.5+ m > clearanceLimit 2.0 m
        expect(worst2.result.status).toBe("SAFE");
        expect(sweep2.anyCollision).toBe(false);
        expect(sweep2.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("Collision detection: boom long enough to collide during sweep flags CRITICAL and anyCollision=true", () => {
        // Boom length 20 m from (10, 10, 0) m
        // Distance to Tower A SW corner (25, 20) is 18.028 m < 20 m!
        // At theta ~ 34°, boom extends into/through Tower A.
        const placement: BoomPlacement = {
            pivotM: { x: 10, y: 10, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 20.0,
            slewDeg: 0,
            elevationDeg: 0,
        };

        const sweep = sweepSlew(factory, placement, 0, 90, 5, [TOWER_A]);
        expect(sweep.anyCollision).toBe(true);
        expect(sweep.worstStep).not.toBeNull();
        expect(sweep.worstStep!.result.status).toBe("CRITICAL");
        expect(sweep.worstStep!.result.isCollision).toBe(true);
    });

    test("Reverse sweep (90° to 0°) produces consistent worst distance", () => {
        const placement: BoomPlacement = {
            pivotM: { x: 10, y: 10, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 12.0,
            slewDeg: 0,
            elevationDeg: 0,
        };

        const fwd = sweepSlew(factory, placement, 0, 90, 5, [TOWER_A]);
        const rev = sweepSlew(factory, placement, 90, 0, 5, [TOWER_A]);

        expect(fwd.worstStep).not.toBeNull();
        expect(rev.worstStep).not.toBeNull();
        expect(fwd.worstStep!.slewDeg).toBe(rev.worstStep!.slewDeg);
        expect(fwd.worstStep!.result.minDistanceM).toBeCloseTo(rev.worstStep!.result.minDistanceM, 3);
    });

    test("Power line sweep: boom sweeping towards west (90° to 180°), worst clearance at 180° with WARNING", () => {
        // Hand calculation:
        // Pivot at (3, 31, 0), boom length 10 m, radius 0.5 m, elevation 0°.
        // Power line thin wall at x = -9.0 m, clearance limit = 6.0 m.
        // Sweep slew from 90° (North) to 180° (West) in steps of 15°.
        // At 90°: boom points North along x = 3 m.
        //   Gap to wire = 3.0 - (-9.0) - 0.5 (radius) = 11.5 m -> SAFE.
        // At 180°: boom points West towards wire.
        //   Boom tip at x = 3 - 10 = -7.0 m (flat end disc).
        //   Gap to wire = -7.0 - (-9.0) = 2.0 m.
        //   2.0 m < 6.0 m limit -> WARNING.
        // Kernel returns minDistance 2.0 m at slew 180°.
        const placement: BoomPlacement = {
            pivotM: { x: 3, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 10.0,
            slewDeg: 0,
            elevationDeg: 0,
        };

        const sweep = sweepSlew(factory, placement, 90, 180, 15, [], POWER_LINE);
        expect(sweep.worstStep).not.toBeNull();
        expect(sweep.worstStep!.slewDeg).toBe(180);
        expect(sweep.worstStep!.result.minDistanceM).toBeCloseTo(2.0, 1);
        expect(sweep.worstStep!.result.status).toBe("WARNING");
        expect(sweep.anyCollision).toBe(false);
    });

    test("known limit: a coarse step can miss a 1 cm intrusion that a fine step finds", () => {
        // Boom 20 m, radius 0.01 m, pivot at the origin, slew 180 deg = West, so the
        // flat end is at x = -20.00 m. Thin wall at x = -19.99 m: the tip reaches
        // 0.01 m past it, but only for about +-1.8 degrees around 180 deg
        // (depth = 0.01 - 20 * (1 - cos(phi)) > 0 needs |phi| < 1.8 deg).
        const wall: PowerLineObstacle = { id: "wall", label: "wall", x_m: -19.99, clearanceLimitM: 6.0 };
        const placement: BoomPlacement = {
            pivotM: { x: 0, y: 0, z: 0 },
            boomRadiusM: 0.01,
            boomLengthM: 20.0,
            slewDeg: 0,
            elevationDeg: 0,
        };

        // 5 deg step from 102.5: samples ..., 177.5, 182.5. Both are outside +-1.8 deg.
        const coarse = sweepSlew(factory, placement, 102.5, 257.5, 5, [], wall);
        expect(coarse.anyCollision).toBe(false);
        expect(coarse.worstStep!.result.status).toBe("WARNING"); // still red, 0.009 m from the wall
        expect(coarse.worstStep!.result.minDistanceM).toBeLessThan(0.02);
        expect(coarse.sweepStatus).toBe("WARNING");

        // 1 deg step includes 179, 180 and 181 deg, inside +-1.8 deg.
        const fine = sweepSlew(factory, placement, 102, 258, 1, [], wall);
        expect(fine.anyCollision).toBe(true);
        expect(fine.worstStep!.result.status).toBe("CRITICAL");
        expect(fine.sweepStatus).toBe("CRITICAL");
    });

    // -----------------------------------------------------------------------
    // Review: discrete sampling must not return an unqualified SAFE.
    // -----------------------------------------------------------------------
    describe("whole-swing verdict (sweepStatus) covers the angles between the samples", () => {
        const placement: BoomPlacement = {
            pivotM: { x: 0, y: 0, z: 0 },
            boomRadiusM: 0.01,
            boomLengthM: 20.0,
            slewDeg: 0,
            elevationDeg: 0,
        };

        test("clearanceLimitM = 0: a coarse step that misses a real collision is WARNING, not SAFE", () => {
            // Same wall as the known-limit test (tip reaches 1 cm past it at 180 deg), but with
            // a limit of 0, so every sample reads status SAFE (0.009 m >= 0).
            const wall: PowerLineObstacle = { id: "wall", label: "wall", x_m: -19.99, clearanceLimitM: 0 };
            const coarse = sweepSlew(factory, placement, 102.5, 257.5, 5, [], wall);
            expect(coarse.anyCollision).toBe(false);
            expect(coarse.worstStep!.result.status).toBe("SAFE"); // what the samples alone say
            expect(coarse.worstStep!.result.minDistanceM).toBeGreaterThan(0);
            // The old code stopped here and the sweep looked SAFE. Now it is not proved:
            expect(coarse.sweepStatus).toBe("WARNING");
            expect(coarse.guaranteedMinDistanceM!).toBeLessThan(0);
            expect(coarse.sweepStatusNote).toMatch(/smaller step/);

            const fine = sweepSlew(factory, placement, 102, 258, 1, [], wall);
            expect(fine.anyCollision).toBe(true);
            expect(fine.sweepStatus).toBe("CRITICAL");
        });

        test("the guaranteed distance is a real lower bound: it is never above the fine-step minimum", () => {
            const wall: PowerLineObstacle = { id: "wall", label: "wall", x_m: -19.99, clearanceLimitM: 0 };
            const coarse = sweepSlew(factory, placement, 102.5, 257.5, 5, [], wall);
            const fine = sweepSlew(factory, placement, 102, 258, 0.5, [], wall);
            expect(coarse.guaranteedMinDistanceM!).toBeLessThanOrEqual(fine.worstStep!.result.minDistanceM);
        });

        test("a wall that is far enough is proved SAFE even with a limit of 0 and a 5 degree step", () => {
            // Boom end at x = -20 m, wall at x = -25 m: 5 m gap. Allowance at 5 deg is about 0.87 m.
            const farWall: PowerLineObstacle = { id: "far", label: "far wall", x_m: -25, clearanceLimitM: 0 };
            const report = sweepSlew(factory, placement, 150, 210, 5, [], farWall);
            expect(report.betweenSamplesAllowanceM).toBeCloseTo(0.8726, 3);
            expect(report.guaranteedMinDistanceM!).toBeGreaterThan(4);
            expect(report.sweepStatus).toBe("SAFE");
        });

        test("BACKLOG acceptance pose (12 m boom, Tower A, 5 degree step) is still SAFE with the allowance", () => {
            const acceptance: BoomPlacement = {
                pivotM: { x: 10, y: 10, z: 0 },
                boomRadiusM: 0.5,
                boomLengthM: 12,
                slewDeg: 0,
                elevationDeg: 0,
            };
            const report = sweepSlew(factory, acceptance, 0, 90, 5, [TOWER_A]);
            // Hand calculation: allowance = 2 * sqrt(12^2 + 0.5^2) * sin(2.5 deg / 2) = 0.524 m.
            expect(report.betweenSamplesAllowanceM).toBeCloseTo(0.524, 3);
            // Sampled minimum 6.023 m, so guaranteed 6.023 - 0.524 = 5.50 m, above the 2.0 m limit.
            expect(report.guaranteedMinDistanceM!).toBeGreaterThan(5.4);
            expect(report.sweepStatus).toBe("SAFE");
        });

        test("no obstacles: sweepStatus is null, never SAFE", () => {
            const report = sweepSlew(factory, placement, 0, 90, 5, []);
            expect(report.sweepStatus).toBeNull();
            expect(report.guaranteedMinDistanceM).toBeNull();
        });

        test("a single angle has no gap, so sweepStatus is the sampled status", () => {
            const farWall: PowerLineObstacle = { id: "far", label: "far wall", x_m: -25, clearanceLimitM: 0 };
            const report = sweepSlew(factory, placement, 180, 180, 5, [], farWall);
            expect(report.maxAngleGapDeg).toBe(0);
            expect(report.betweenSamplesAllowanceM).toBe(0);
            expect(report.sweepStatus).toBe("SAFE");
        });
    });

    // -----------------------------------------------------------------------
    // Review (Namya): free the solids, build the obstacles once, more obstacle cases.
    // -----------------------------------------------------------------------
    describe("solids are built once and freed (review)", () => {
        const boom: BoomPlacement = {
            pivotM: { x: 10, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 12,
            slewDeg: 0,
            elevationDeg: 0,
        };
        const OTHER: ObstacleFootprint = {
            id: "other",
            label: "Other building",
            polygon: [
                [30, -10],
                [40, -10],
                [40, 0],
                [30, 0],
            ],
            height_m: 20,
            clearanceLimitM: 2,
        };

        test("sweepSlew builds each obstacle once, not at every angle, and frees every solid", () => {
            const t = trackingFactory(factory);
            // 0 to 90 in steps of 30 = 4 angles, 2 buildings.
            const report = sweepSlew(t.factory, boom, 0, 90, 30, [TOWER_A, OTHER]);
            expect(report.sampleCount).toBe(4);
            expect(t.calls.cylinder).toBe(4); // one boom per angle
            expect(t.calls.prism).toBe(2); // one solid per building, not 2 x 4
            expect(t.tracked.length).toBeGreaterThanOrEqual(6);
            for (const record of t.tracked) expect(record.disposed).toBe(1);
        });

        test("the overlap solid from the collision test is freed too", () => {
            const t = trackingFactory(factory);
            // 20 m boom reaches Tower A (corner 18 m away): collision, so booleanCommon runs.
            const long: BoomPlacement = { ...boom, pivotM: { x: 10, y: 10, z: 0 }, boomLengthM: 20 };
            const report = sweepSlew(t.factory, long, 0, 90, 30, [TOWER_A]);
            expect(report.anyCollision).toBe(true);
            expect(t.tracked.some((r) => r.kind === "booleanCommon")).toBe(true);
            for (const record of t.tracked) expect(record.disposed).toBe(1);
        });

        test("computeSiteClearance frees its solids too", () => {
            const t = trackingFactory(factory);
            computeSiteClearance(t.factory, boom, [TOWER_A, OTHER]);
            expect(t.tracked.length).toBe(3); // 1 boom + 2 buildings
            for (const record of t.tracked) expect(record.disposed).toBe(1);
        });
    });

    describe("more obstacle cases (review)", () => {
        const boom: BoomPlacement = {
            pivotM: { x: 10, y: 31, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 12,
            slewDeg: 0,
            elevationDeg: 0,
        };

        test("several obstacles: the worst result over all angles and all obstacles is reported", () => {
            // Tower A face at x = 25, boom end at x = 22 at 0 deg: 3.0 m.
            // Power line at x = -9, boom end at x = -2 at 180 deg: 7.0 m.
            const report = sweepSlew(factory, boom, 0, 180, 30, [TOWER_A], POWER_LINE);
            expect(report.worstStep!.result.obstacleId).toBe("tower_a");
            expect(report.worstStep!.slewDeg).toBe(0);
            expect(report.worstStep!.result.minDistanceM).toBeCloseTo(3.0, 1);
            expect(report.worstStep!.result.status).toBe("SAFE");
            // Every step has one result per obstacle.
            for (const step of report.steps) expect(step.report.obstacles).toHaveLength(2);
            const at180 = report.steps[report.steps.length - 1];
            expect(at180.slewDeg).toBe(180);
            expect(at180.report.worstCase!.obstacleId).toBe("power_line");
            expect(at180.report.worstCase!.minDistanceM).toBeCloseTo(7.0, 1);
        });

        test("a closer power line becomes the worst obstacle", () => {
            // Pivot at x = 3: boom end at x = -7 at 180 deg, 2.0 m from the wall (limit 6 m).
            const nearWire: BoomPlacement = { ...boom, pivotM: { x: 3, y: 31, z: 0 }, boomLengthM: 10 };
            const report = sweepSlew(factory, nearWire, 0, 180, 30, [TOWER_A], POWER_LINE);
            expect(report.worstStep!.result.obstacleId).toBe("power_line");
            expect(report.worstStep!.slewDeg).toBe(180);
            expect(report.worstStep!.result.status).toBe("WARNING");
            expect(report.sweepStatus).toBe("WARNING");
        });

        test("fromDeg === toDeg with an obstacle: one sample, no gap", () => {
            const report = sweepSlew(factory, boom, 0, 0, 5, [TOWER_A]);
            expect(report.sampleCount).toBe(1);
            expect(report.steps).toHaveLength(1);
            expect(report.steps[0].slewDeg).toBe(0);
            expect(report.worstStep!.result.obstacleId).toBe("tower_a");
            expect(report.worstStep!.result.minDistanceM).toBeCloseTo(3.0, 1);
            expect(report.maxAngleGapDeg).toBe(0);
            expect(report.sweepStatus).toBe("SAFE"); // 3.0 m >= 2.0 m, no gap to cover
        });

        test.each([
            ["building height 0", { ...TOWER_A, height_m: 0 }],
            ["building height NaN", { ...TOWER_A, height_m: Number.NaN }],
            ["building height negative", { ...TOWER_A, height_m: -5 }],
            ["building limit NaN", { ...TOWER_A, clearanceLimitM: Number.NaN }],
            ["building limit negative", { ...TOWER_A, clearanceLimitM: -1 }],
            [
                "building with 2 vertices",
                {
                    ...TOWER_A,
                    polygon: [
                        [0, 0],
                        [1, 1],
                    ] as [number, number][],
                },
            ],
            [
                "building with a NaN corner",
                {
                    ...TOWER_A,
                    polygon: [
                        [0, 0],
                        [1, 0],
                        [Number.NaN, 1],
                    ] as [number, number][],
                },
            ],
        ])("invalid obstacle (%s) throws RangeError before any geometry is built", (_name, bad) => {
            const t = trackingFactory(factory);
            expect(() => sweepSlew(t.factory, boom, 0, 90, 30, [TOWER_A, bad])).toThrow(RangeError);
            expect(t.calls.cylinder ?? 0).toBe(0);
            expect(t.calls.prism ?? 0).toBe(0);
            expect(t.tracked).toHaveLength(0);
        });

        test("invalid power line throws RangeError before any geometry is built", () => {
            const t = trackingFactory(factory);
            const badWire: PowerLineObstacle = { ...POWER_LINE, x_m: Number.NaN };
            expect(() => sweepSlew(t.factory, boom, 0, 90, 30, [TOWER_A], badWire)).toThrow(RangeError);
            expect(t.calls.cylinder ?? 0).toBe(0);
            expect(t.calls.prism ?? 0).toBe(0);
            const badLimit: PowerLineObstacle = { ...POWER_LINE, clearanceLimitM: -2 };
            expect(() => sweepSlew(t.factory, boom, 0, 90, 30, [], badLimit)).toThrow(RangeError);
            expect(t.calls.cylinder ?? 0).toBe(0);
        });
    });

    test("betweenSamplesAllowanceM: 2 * sqrt(L^2 + r^2) * sin(gap / 4)", () => {
        const boom: BoomPlacement = {
            pivotM: { x: 0, y: 0, z: 0 },
            boomRadiusM: 0.5,
            boomLengthM: 12,
            slewDeg: 0,
            elevationDeg: 0,
        };
        // gap 5 deg: delta = 2.5 deg, 2 * 12.0104 * sin(1.25 deg) = 0.5240 m
        expect(betweenSamplesAllowanceM(boom, 5)).toBeCloseTo(0.524, 3);
        // gap 2 deg: 2 * 12.0104 * sin(0.5 deg) = 0.2096 m
        expect(betweenSamplesAllowanceM(boom, 2)).toBeCloseTo(0.2096, 3);
        expect(betweenSamplesAllowanceM(boom, 0)).toBe(0);
    });
});
