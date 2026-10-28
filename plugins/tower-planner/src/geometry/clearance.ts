// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * Pure TypeScript 2D geometry helpers for tower crane clearance checks (T6).
 * No Three.js, no OCCT dependencies.
 */

export type Point2D = { x: number; y: number };
export type Segment2D = { a: Point2D; b: Point2D };
export type Polygon2D = Point2D[]; // order not assumed; should form closed or open ring - functions handle generically

/**
 * Point-in-polygon test using ray casting algorithm.
 * Behavior (explicitly documented):
 * - Returns true if point is strictly inside OR on the boundary (point-on-edge).
 * - Returns false if point is strictly outside.
 * This matches T6 requirement to test point-on-edge explicitly.
 */
export function pointInPolygon(p: Point2D, poly: Polygon2D, eps = 1e-9): boolean {
    if (!poly || poly.length === 0) return false;
    const n = poly.length;

    // Check if point is on boundary (including vertices)
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = poly[i];
        const b = poly[j];
        const dist = pointToSegmentDistance(p, a, b);
        if (dist <= eps) {
            return true; // on edge or vertex
        }
    }

    // Ray casting
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[i].x,
            yi = poly[i].y;
        const xj = poly[j].x,
            yj = poly[j].y;

        const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + eps) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Distance from point p to line segment ab.
 */
export function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby;
    if (ab2 <= 0) {
        // a == b
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    const projx = a.x + t * abx;
    const projy = a.y + t * aby;
    const dx2 = p.x - projx;
    const dy2 = p.y - projy;
    return Math.sqrt(dx2 * dx2 + dy2 * dy2);
}

/**
 * Minimum distance from point p to any edge of polygon poly.
 * If point is inside or on boundary, the closest boundary distance is returned
 * (0 if on boundary). This is useful for oversail calculations.
 */
export function pointToPolygonDistance(p: Point2D, poly: Polygon2D): number {
    if (!poly || poly.length === 0) return Number.POSITIVE_INFINITY;
    const n = poly.length;
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const d = pointToSegmentDistance(p, poly[i], poly[j]);
        if (d < minDist) minDist = d;
        if (minDist === 0) break;
    }
    return minDist;
}

/**
 * Distance from point (x0,y0) to line defined by ax + by + c = 0.
 * Returns absolute distance.
 */
export function pointToLineDistance(p: Point2D, line: { a: number; b: number; c: number }): number {
    const denom = Math.sqrt(line.a * line.a + line.b * line.b);
    if (denom === 0) return Number.POSITIVE_INFINITY;
    return Math.abs(line.a * p.x + line.b * p.y + line.c) / denom;
}

/**
 * Distance from point to vertical line x = k.
 */
export function distanceToVerticalLine(p: Point2D, xk: number): number {
    return Math.abs(p.x - xk);
}

/**
 * Distance from point to horizontal line y = k.
 */
export function distanceToHorizontalLine(p: Point2D, yk: number): number {
    return Math.abs(p.y - yk);
}

/**
 * Check clearance between a point (mast/base) and a line obstacle.
 * Returns { available, required, violation, ok }.
 * violation > 0 means clearance violated by violation meters.
 */
export function checkLineClearance(
    p: Point2D,
    obstacle:
        | { type: "vertical"; x: number }
        | { type: "horizontal"; y: number }
        | { type: "abc"; a: number; b: number; c: number },
    requiredClearance: number,
): { available: number; required: number; violation: number; ok: boolean } {
    let available = Number.POSITIVE_INFINITY;
    if (obstacle.type === "vertical") {
        available = distanceToVerticalLine(p, obstacle.x);
    } else if (obstacle.type === "horizontal") {
        available = distanceToHorizontalLine(p, obstacle.y);
    } else if (obstacle.type === "abc") {
        available = pointToLineDistance(p, obstacle);
    }
    const violation = requiredClearance - available;
    return {
        available,
        required: requiredClearance,
        violation: violation > 0 ? violation : 0,
        ok: available >= requiredClearance - 1e-12,
    };
}

/**
 * Circle/swing envelope oversail depth against a polygon.
 * Definition (for tower crane jib swing circle): oversail depth = max(0, swingRadius - distanceFromCenterToPolygon)
 * when the circle intersects/touches the polygon in the sense that it extends beyond the closest boundary
 * toward the polygon. If the polygon is the forbidden obstacle and the center is outside, oversail occurs
 * if swingRadius > distance(center, polygon). The depth of penetration into the obstacle is swingRadius - distance(center, polygon)
 * (measured along the line connecting center to the closest point on the polygon).
 * Returns { intersects, distanceToPolygon, oversailDepth, ok } where ok means no oversail (oversailDepth <= eps).
 */
export function checkCirclePolygonOversail(
    center: Point2D,
    swingRadius: number,
    polygon: Polygon2D,
    eps = 1e-9,
): { intersects: boolean; distanceToPolygon: number; oversailDepth: number; ok: boolean } {
    const distanceToPolygon = pointToPolygonDistance(center, polygon);
    const insideOrOn = pointInPolygon(center, polygon, eps);
    if (insideOrOn) {
        // If center is inside/on forbidden area, this is a severe violation; oversail depth is treated as >= radius conceptually
        // but per backlog examples center is outside mast position - still compute
        const oversailDepth = swingRadius; // conservative
        return { intersects: true, distanceToPolygon: 0, oversailDepth, ok: false };
    }
    if (swingRadius >= distanceToPolygon - eps) {
        const oversailDepth = Math.max(0, swingRadius - distanceToPolygon);
        return { intersects: true, distanceToPolygon, oversailDepth, ok: oversailDepth <= eps };
    }
    return { intersects: false, distanceToPolygon, oversailDepth: 0, ok: true };
}

export const clearanceKernel = {
    pointInPolygon,
    pointToSegmentDistance,
    pointToPolygonDistance,
    pointToLineDistance,
    distanceToVerticalLine,
    distanceToHorizontalLine,
    checkLineClearance,
    checkCirclePolygonOversail,
};
