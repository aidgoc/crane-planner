// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import {
    checkCirclePolygonOversail,
    checkLineClearance,
    distanceToVerticalLine,
    pointInPolygon,
    pointToPolygonDistance,
    pointToSegmentDistance,
} from "../src/geometry";

describe("tower-planner clearance kernel (T6)", () => {
    test("mast (30,40), school rectangle (8,78)-(52,96), swing radius 40 m => oversail 2 m", () => {
        // Hand-worked calculation:
        // School nb_north is axis-aligned rectangle: (8,78), (52,78), (52,96), (8,96).
        // Mast position M = (30,40). Closest point on school polygon to M is (30,78) on the bottom edge.
        // Distance(M, school) = distance((30,40), (30,78)) = sqrt((0)^2 + (38)^2) = 38 m.
        // Swing/jib envelope circle radius r = 40 m around mast. The circle extends to y = 40 + 40 = 80 m.
        // School occupies y from 78 to 96 at x near 30; intersection/oversail occurs.
        // Oversail depth = r - distance(M, polygon) = 40 - 38 = 2 m (extends 2 m into the polygon).
        const mast = { x: 30, y: 40 };
        const school = [
            { x: 8, y: 78 },
            { x: 52, y: 78 },
            { x: 52, y: 96 },
            { x: 8, y: 96 },
        ];
        const swingRadius = 40;
        const dist = pointToPolygonDistance(mast, school);
        expect(dist).toBeCloseTo(38, 9);
        const result = checkCirclePolygonOversail(mast, swingRadius, school);
        expect(result.intersects).toBe(true);
        expect(result.oversailDepth).toBeCloseTo(2.0, 9);
        expect(result.ok).toBe(false);
    });

    test("mast (30,40), power line x=-9, required clearance 46 m, available distance 39 m => violation 7 m", () => {
        // Hand-worked calculation:
        // Power line is vertical line at x = -9 (west of plot). Mast at (30,40).
        // Horizontal distance = |30 - (-9)| = |39| = 39 m. Available = 39 m.
        // Required clearance = 46 m (as specified). Violation = required - available = 7 m if required > available.
        const mast = { x: 30, y: 40 };
        const available = distanceToVerticalLine(mast, -9);
        expect(available).toBeCloseTo(39, 9);
        const clearance = checkLineClearance(mast, { type: "vertical", x: -9 }, 46);
        expect(clearance.available).toBeCloseTo(39, 9);
        expect(clearance.required).toBe(46);
        expect(clearance.violation).toBeCloseTo(7.0, 9);
        expect(clearance.ok).toBe(false);
    });

    test("point on polygon edge is treated as inside/boundary (point-on-edge)", () => {
        // Hand-worked: polygon square (0,0),(10,0),(10,10),(0,10). Point (5,0) is on the bottom edge.
        // pointToSegmentDistance to bottom edge should be 0; pointInPolygon must return true.
        const poly = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];
        const pOnEdge = { x: 5, y: 0 };
        const d = pointToSegmentDistance(pOnEdge, poly[0], poly[1]);
        expect(d).toBeCloseTo(0, 9);
        expect(pointInPolygon(pOnEdge, poly)).toBe(true);
    });

    test("point outside polygon", () => {
        // Hand-worked: square (0,0),(10,0),(10,10),(0,10). Point (-1,5) is outside.
        const poly = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];
        const pOut = { x: -1, y: 5 };
        expect(pointInPolygon(pOut, poly)).toBe(false);
        const d = pointToPolygonDistance(pOut, poly);
        expect(d).toBeGreaterThan(0);
    });
});
