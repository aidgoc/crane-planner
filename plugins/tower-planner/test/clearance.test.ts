// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import {
    checkAnnulusPolygonIntersection,
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

    test("oversail depth is measured into the obstacle from the nearest boundary", () => {
        // Hand-worked: square (0,0),(10,0),(10,10),(0,10).
        // Mast (5,5) is 5 m from every edge. Inside the obstacle, the farthest reach
        // from the nearest boundary is distance + radius, not radius - distance:
        // radius 8 m gives 5 + 8 = 13 m and radius 2 m gives 5 + 2 = 7 m.
        // Mast (5,0) lies on the bottom edge, so distance is 0 and radius 2 m gives 2 m.
        // Outside at (-3,5), distance is 3 m, so radius 8 m penetrates 8 - 3 = 5 m.
        const square = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];

        const insideLarge = checkCirclePolygonOversail({ x: 5, y: 5 }, 8, square);
        expect(insideLarge.distanceToPolygon).toBeCloseTo(5, 9);
        expect(insideLarge.oversailDepth).toBeCloseTo(13, 9);
        expect(insideLarge.intersects).toBe(true);
        expect(insideLarge.ok).toBe(false);

        const insideSmall = checkCirclePolygonOversail({ x: 5, y: 5 }, 2, square);
        expect(insideSmall.distanceToPolygon).toBeCloseTo(5, 9);
        expect(insideSmall.oversailDepth).toBeCloseTo(7, 9);
        expect(insideSmall.intersects).toBe(true);
        expect(insideSmall.ok).toBe(false);

        const onBoundary = checkCirclePolygonOversail({ x: 5, y: 0 }, 2, square);
        expect(onBoundary.distanceToPolygon).toBeCloseTo(0, 9);
        expect(onBoundary.oversailDepth).toBeCloseTo(2, 9);
        expect(onBoundary.intersects).toBe(true);
        expect(onBoundary.ok).toBe(false);

        // On the boundary is never ok, even when the swing radius is zero.
        const zeroOnBoundary = checkCirclePolygonOversail({ x: 5, y: 0 }, 0, square);
        expect(zeroOnBoundary.distanceToPolygon).toBeCloseTo(0, 9);
        expect(zeroOnBoundary.oversailDepth).toBe(0);
        expect(zeroOnBoundary.intersects).toBe(true);
        expect(zeroOnBoundary.ok).toBe(false);

        const outside = checkCirclePolygonOversail({ x: -3, y: 5 }, 8, square);
        expect(outside.distanceToPolygon).toBeCloseTo(3, 9);
        expect(outside.oversailDepth).toBeCloseTo(5, 9);
        expect(outside.intersects).toBe(true);
        expect(outside.ok).toBe(false);

        // Outside and out of reach: (-5,5) is 5 m away with a 2 m radius.
        const clear = checkCirclePolygonOversail({ x: -5, y: 5 }, 2, square);
        expect(clear.distanceToPolygon).toBeCloseTo(5, 9);
        expect(clear.oversailDepth).toBe(0);
        expect(clear.intersects).toBe(false);
        expect(clear.ok).toBe(true);

        // Exact touch: (-2,5) is 2 m away with a 2 m radius. Touching intersects,
        // but there is zero penetration, so it remains ok.
        const touch = checkCirclePolygonOversail({ x: -2, y: 5 }, 2, square);
        expect(touch.distanceToPolygon).toBeCloseTo(2, 9);
        expect(touch.oversailDepth).toBe(0);
        expect(touch.intersects).toBe(true);
        expect(touch.ok).toBe(true);
    });

    test("annulus (10 m, 20 m) intersects when polygon edges cross the band", () => {
        // Hand-worked: annulus centred at (0,0) with inner radius 10 m and outer 20 m.
        // Rectangle x = -25..25, y = -2..2. Every vertex is at radius
        // sqrt(25^2 + 2^2) = sqrt(629) ~= 25.08 m, so no vertex is in the band.
        // The top/bottom edges reach radius 10 at x = +/-sqrt(10^2 - 2^2) = +/-9.80 m
        // and radius 20 at x = +/-sqrt(20^2 - 2^2) = +/-19.90 m, so both edges cross
        // the band even though their endpoints are outside it.
        const rectangle = [
            { x: -25, y: -2 },
            { x: 25, y: -2 },
            { x: 25, y: 2 },
            { x: -25, y: 2 },
        ];
        const result = checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 10, 20, rectangle);
        expect(result.vertexInBand).toBe(false);
        expect(result.edgeInBand).toBe(true);
        expect(result.polygonEnclosesBand).toBe(false);
        expect(result.intersects).toBe(true);
    });

    test("polygon wholly inside the annulus hole does not intersect", () => {
        // Hand-worked: square [-3,3]^2 has maximum corner radius sqrt(3^2 + 3^2)
        // = sqrt(18) ~= 4.24 m, well below the 10 m inner radius, so every vertex and
        // edge stays in the hole. The mid-band sample at radius (10 + 20) / 2 = 15 m,
        // point (15,0), is outside the square.
        const innerSquare = [
            { x: -3, y: -3 },
            { x: 3, y: -3 },
            { x: 3, y: 3 },
            { x: -3, y: 3 },
        ];
        const result = checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 10, 20, innerSquare);
        expect(result.vertexInBand).toBe(false);
        expect(result.edgeInBand).toBe(false);
        expect(result.polygonEnclosesBand).toBe(false);
        expect(result.intersects).toBe(false);
    });

    test("polygon wholly outside the outer radius does not intersect", () => {
        // Hand-worked: square [25,35]^2 has minimum corner radius
        // sqrt(25^2 + 25^2) = sqrt(1250) ~= 35.36 m, greater than the 20 m outer
        // radius. The mid-band sample (15,0) is outside the square.
        const outerSquare = [
            { x: 25, y: 25 },
            { x: 35, y: 25 },
            { x: 35, y: 35 },
            { x: 25, y: 35 },
        ];
        const result = checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 10, 20, outerSquare);
        expect(result.vertexInBand).toBe(false);
        expect(result.edgeInBand).toBe(false);
        expect(result.polygonEnclosesBand).toBe(false);
        expect(result.intersects).toBe(false);
    });

    test("polygon enclosing the whole band intersects without touching an edge", () => {
        // Hand-worked: square [-30,30]^2 has corner radius sqrt(30^2 + 30^2)
        // = sqrt(1800) ~= 42.43 m (outside the band) and each edge is 30 m from the
        // centre (outside the 20 m outer radius). The band is therefore entirely
        // inside the square; the mid-band sample (15,0) is inside the square.
        const enclosingSquare = [
            { x: -30, y: -30 },
            { x: 30, y: -30 },
            { x: 30, y: 30 },
            { x: -30, y: 30 },
        ];
        const result = checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 10, 20, enclosingSquare);
        expect(result.vertexInBand).toBe(false);
        expect(result.edgeInBand).toBe(false);
        expect(result.polygonEnclosesBand).toBe(true);
        expect(result.intersects).toBe(true);
    });

    test("touching the inner or outer boundary counts as intersection", () => {
        // Hand-worked outer touch: rectangle x = 20..25, y = -1..1. Its corners are at
        // radius sqrt(20^2 + 1^2) = sqrt(401) ~= 20.025 m, outside the 20 m outer
        // radius, but the left edge contains (20,0), exactly on the outer boundary.
        const outerTouch = [
            { x: 20, y: -1 },
            { x: 25, y: -1 },
            { x: 25, y: 1 },
            { x: 20, y: 1 },
        ];
        const outerResult = checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 10, 20, outerTouch);
        expect(outerResult.vertexInBand).toBe(false);
        expect(outerResult.edgeInBand).toBe(true);
        expect(outerResult.intersects).toBe(true);

        // Hand-worked inner touch: triangle (0,0),(10,0),(0,5) lies inside the hole
        // except for the vertex (10,0), exactly on the 10 m inner boundary.
        const innerTouch = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 0, y: 5 },
        ];
        const innerResult = checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 10, 20, innerTouch);
        expect(innerResult.vertexInBand).toBe(true);
        expect(innerResult.intersects).toBe(true);
    });

    test("inner radius zero is a solid disk and invalid radii are rejected", () => {
        // Hand-worked: with inner 0 and outer 10 m the annulus is the disk of radius
        // 10 m. Square [-2,2]^2 has corner radius sqrt(8) ~= 2.83 m, so it lies in the
        // disk and intersects. Square [15,20]^2 has minimum corner radius
        // sqrt(15^2 + 15^2) ~= 21.21 m, so it is outside the disk.
        const insideDisk = [
            { x: -2, y: -2 },
            { x: 2, y: -2 },
            { x: 2, y: 2 },
            { x: -2, y: 2 },
        ];
        expect(checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 0, 10, insideDisk).intersects).toBe(true);

        const outsideDisk = [
            { x: 15, y: 15 },
            { x: 20, y: 15 },
            { x: 20, y: 20 },
            { x: 15, y: 20 },
        ];
        expect(checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 0, 10, outsideDisk).intersects).toBe(false);

        expect(() => checkAnnulusPolygonIntersection({ x: 0, y: 0 }, 20, 10, insideDisk)).toThrow(RangeError);
        expect(() => checkAnnulusPolygonIntersection({ x: 0, y: 0 }, -1, 10, insideDisk)).toThrow(RangeError);
    });

    test("concave L-shaped polygon intersects an annulus centred on its reflex vertex", () => {
        // Hand-worked: L-shape (0,0),(10,0),(10,4),(4,4),(4,10),(0,10).
        // Annulus centre (4,4), inner 1 m, outer 3 m. The reflex vertex (4,4) has radius
        // 0, inside the hole. The other vertices have radii 6, 6, 5.66, 7.21 and 7.21 m,
        // all outside the 3 m outer radius. The edges (4,4)-(10,4) and (4,4)-(4,10)
        // leave the hole and reach radius 6 m, so they cross the band.
        const lShape = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 4 },
            { x: 4, y: 4 },
            { x: 4, y: 10 },
            { x: 0, y: 10 },
        ];
        const result = checkAnnulusPolygonIntersection({ x: 4, y: 4 }, 1, 3, lShape);
        expect(result.vertexInBand).toBe(false);
        expect(result.edgeInBand).toBe(true);
        expect(result.polygonEnclosesBand).toBe(false);
        expect(result.intersects).toBe(true);
    });

    test("concave U-shaped polygon handles bands in its notch and in its solid body", () => {
        // Hand-worked: U-shape (-10,-10),(10,-10),(10,10),(2,10),(2,0),(-2,0),(-2,10),(-10,10).
        // The notch is x in (-2,2), y in (0,10), open at the top.
        // Band centre (0,5), radii 1..1.5 lies wholly in the notch: the nearest notch
        // edges x=+/-2 are 2 m away, so no vertex or edge touches the band and the
        // mid-band sample (1.25,5) is outside the polygon.
        // Band centre (0,-5), radii 1..2 lies wholly in the solid bottom: the nearest
        // boundary is y=0 at 5 m (or a notch edge endpoint at sqrt(2^2+5^2) ~= 5.39 m),
        // so no edge touches the band and the mid-band sample (1.5,-5) is inside.
        const uShape = [
            { x: -10, y: -10 },
            { x: 10, y: -10 },
            { x: 10, y: 10 },
            { x: 2, y: 10 },
            { x: 2, y: 0 },
            { x: -2, y: 0 },
            { x: -2, y: 10 },
            { x: -10, y: 10 },
        ];

        const inNotch = checkAnnulusPolygonIntersection({ x: 0, y: 5 }, 1, 1.5, uShape);
        expect(inNotch.vertexInBand).toBe(false);
        expect(inNotch.edgeInBand).toBe(false);
        expect(inNotch.polygonEnclosesBand).toBe(false);
        expect(inNotch.intersects).toBe(false);

        const inSolid = checkAnnulusPolygonIntersection({ x: 0, y: -5 }, 1, 2, uShape);
        expect(inSolid.vertexInBand).toBe(false);
        expect(inSolid.edgeInBand).toBe(false);
        expect(inSolid.polygonEnclosesBand).toBe(true);
        expect(inSolid.intersects).toBe(true);
    });
});
