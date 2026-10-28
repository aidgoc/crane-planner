// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import {
    BASE_EXCLUSION_RADIUS_M,
    createDefaultCraneCatalogue,
    deriveCraneLayout,
    metresToMillimetres,
    millimetresToMetres,
    normalizeAngle,
    PLANNING_DISCLAIMER,
    rotatePoint,
    sampleCircle,
    validateCraneCatalogue,
} from "../src/model/cranePlacement";

describe("tower-planner placement and rings (T7)", () => {
    test("mast (30,40), slew 0, catalogue radii 16.2/40/15 => jib tip (70,40) and counter tip (15,40)", () => {
        // Hand-worked calculation:
        // Mast M = (30,40). Slew angle 0 deg points along +X.
        // Jib tip = M + (max hook radius, 0) = (30 + 40, 40) = (70,40).
        // Counter-jib points 180 deg from the jib: (30 - 15, 40) = (15,40).
        // Plan rings are concentric at M with radii equal to the catalogue values in metres.
        const catalogue = createDefaultCraneCatalogue();
        const layout = deriveCraneLayout(catalogue, { x: 30, y: 40, slewAngleDeg: 0 });

        expect(layout.mast).toEqual({ x: 30, y: 40 });
        expect(layout.jibTip.x).toBeCloseTo(70, 9);
        expect(layout.jibTip.y).toBeCloseTo(40, 9);
        expect(layout.counterJibTip.x).toBeCloseTo(15, 9);
        expect(layout.counterJibTip.y).toBeCloseTo(40, 9);
        expect(layout.rings.maxHookRadius.radius).toBe(catalogue.maxHookRadius.value);
        expect(layout.rings.minHookRadius.radius).toBe(catalogue.minHookRadius.value);
        expect(layout.rings.counterJibSweep.radius).toBe(catalogue.counterJibRadius.value);
        expect(layout.rings.baseExclusion.radius).toBe(BASE_EXCLUSION_RADIUS_M);
    });

    test("mast (30,40), slew 90 => jib tip (30,80) and counter tip (30,25)", () => {
        // Hand-worked calculation:
        // 90 deg rotates +X onto +Y.
        // Jib tip = (30, 40 + 40) = (30,80).
        // Counter-jib tip = (30, 40 - 15) = (30,25) because 90 + 180 = 270 deg points along -Y.
        const layout = deriveCraneLayout(createDefaultCraneCatalogue(), { x: 30, y: 40, slewAngleDeg: 90 });

        expect(layout.slewAngleDeg).toBe(90);
        expect(layout.jibTip.x).toBeCloseTo(30, 9);
        expect(layout.jibTip.y).toBeCloseTo(80, 9);
        expect(layout.counterJibTip.x).toBeCloseTo(30, 9);
        expect(layout.counterJibTip.y).toBeCloseTo(25, 9);
    });

    test("moving the mast moves every ring centre and keeps the catalogue radii", () => {
        const catalogue = createDefaultCraneCatalogue();
        const layout = deriveCraneLayout(catalogue, { x: -12.5, y: 63.25, slewAngleDeg: -90 });

        expect(layout.slewAngleDeg).toBe(270);
        for (const ring of Object.values(layout.rings)) {
            expect(ring.center).toEqual({ x: -12.5, y: 63.25 });
        }
        expect(layout.rings.maxHookRadius.radius).toBe(40);
        expect(layout.rings.minHookRadius.radius).toBe(16.2);
        expect(layout.rings.counterJibSweep.radius).toBe(15);
        expect(layout.rings.baseExclusion.radius).toBe(20);
    });

    test("rotation, angle normalization and metre/millimetre conversion", () => {
        // Hand-worked: (10,0) rotated 90 deg about the origin is (0,10).
        // -90 deg normalizes to 270 deg; 450 deg normalizes to 90 deg.
        // 2.5 m = 2500 mm and 40000 mm = 40 m.
        const rotated = rotatePoint({ x: 10, y: 0 }, 90);
        expect(rotated.x).toBeCloseTo(0, 9);
        expect(rotated.y).toBeCloseTo(10, 9);
        expect(normalizeAngle(-90)).toBe(270);
        expect(normalizeAngle(450)).toBe(90);
        expect(metresToMillimetres(2.5)).toBe(2500);
        expect(millimetresToMetres(40000)).toBe(40);
    });

    test("sampled max-radius circle keeps the catalogue radius", () => {
        // Hand-worked: 4 segments at 0,90,180,270 deg around (30,40) with r = 40 m
        // gives (70,40), (30,80), (-10,40), (30,0), then closes at (70,40).
        const points = sampleCircle({ x: 30, y: 40 }, 40, 4);
        expect(points).toHaveLength(5);
        expect(points[0].x).toBeCloseTo(70, 9);
        expect(points[0].y).toBeCloseTo(40, 9);
        expect(points[1].x).toBeCloseTo(30, 9);
        expect(points[1].y).toBeCloseTo(80, 9);
        expect(points[2].x).toBeCloseTo(-10, 9);
        expect(points[2].y).toBeCloseTo(40, 9);
        expect(points[3].x).toBeCloseTo(30, 9);
        expect(points[3].y).toBeCloseTo(0, 9);
        expect(points[4].x).toBeCloseTo(70, 9);
        expect(points[4].y).toBeCloseTo(40, 9);
        for (const point of points) {
            expect(Math.hypot(point.x - 30, point.y - 40)).toBeCloseTo(40, 9);
        }
    });

    test("default catalogue is INDICATIVE and invalid dimensions are rejected", () => {
        const catalogue = createDefaultCraneCatalogue();
        expect(PLANNING_DISCLAIMER).toBe("Planning aid, not a certified lift plan.");
        expect(catalogue.minHookRadius.source.kind).toBe("indicative");
        expect(catalogue.maxHookRadius.source.kind).toBe("indicative");
        expect(catalogue.counterJibRadius.source.kind).toBe("indicative");
        expect(validateCraneCatalogue(catalogue)).toEqual([]);

        const invalid = {
            ...catalogue,
            minHookRadius: { ...catalogue.minHookRadius, value: 50 },
        };
        expect(validateCraneCatalogue(invalid)).toContain(
            "Minimum hook radius must not exceed maximum hook radius.",
        );
    });
});
