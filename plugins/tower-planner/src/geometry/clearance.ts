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
 * Oversail depth is the greatest distance the swing circle reaches past the nearest polygon boundary
 * into the obstacle, measured along the line from that boundary through the centre.
 *
 * - Centre outside: the circle reaches the obstacle only when swingRadius >= distanceToPolygon; the
 *   depth inside the obstacle is swingRadius - distanceToPolygon. The sample-site school case -
 *   mast (30,40), radius 40 m, distance 38 m - therefore oversails by 2 m.
 * - Centre inside or on the polygon: the mast already lies in the obstacle, so the farthest point
 *   of the circle from the nearest boundary is distanceToPolygon + swingRadius. On the boundary
 *   this reduces to swingRadius. intersects is always true and ok is false, even when the whole
 *   circle lies inside the polygon.
 *
 * The depth is measured from the nearest boundary and is not clipped by the opposite side of the
 * polygon; it answers how far the circle reaches past that boundary.
 *
 * `intersects` includes boundary touching. `ok` is true only for a center outside the polygon with
 * oversailDepth <= eps; a center inside or on the polygon is never ok, even with a zero swing radius.
 *
 * Returns { intersects, distanceToPolygon, oversailDepth, ok }.
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
        const oversailDepth = distanceToPolygon + swingRadius;
        return { intersects: true, distanceToPolygon, oversailDepth, ok: false };
    }

    const oversailDepth = Math.max(0, swingRadius - distanceToPolygon);
    if (swingRadius >= distanceToPolygon - eps) {
        return { intersects: true, distanceToPolygon, oversailDepth, ok: oversailDepth <= eps };
    }
    return { intersects: false, distanceToPolygon, oversailDepth: 0, ok: true };
}

/**
 * Result of an annulus-versus-polygon intersection test.
 *
 * The annulus is the closed radial band `innerRadius <= |p - center| <= outerRadius`
 * (metres). The polygon is a closed ring: the edge from the last vertex back to the
 * first is included. Both shapes are treated as closed, so touching a boundary counts.
 *
 * `intersects` is true when any of the following hold:
 * - `vertexInBand`: a polygon vertex lies in the band;
 * - `edgeInBand`: an edge crosses or touches the band, even if both endpoints are
 *   outside it;
 * - `polygonEnclosesBand`: the polygon surrounds the whole band, so its area covers
 *   part of it.
 *
 * A polygon wholly inside the inner hole, or wholly outside the outer radius, does
 * not intersect. `polygonEnclosesBand` is only evaluated when the first two tests
 * fail; when true, the band lies entirely inside the polygon.
 */
export type AnnulusPolygonIntersection = {
    intersects: boolean;
    vertexInBand: boolean;
    edgeInBand: boolean;
    polygonEnclosesBand: boolean;
};

/**
 * Test whether a closed annulus (radial band) intersects a simple closed polygon.
 *
 * Units are metres. Radii must be finite with `0 <= innerRadius <= outerRadius`;
 * an inner radius of zero gives a solid disk. `eps` is the tolerance used when
 * comparing radial distances so that boundary contact counts as intersection.
 *
 * The edge test uses the fact that the distance from the centre along an edge is
 * continuous, so the edge's radial range is `[minDistance, maxDistance]`; the
 * maximum occurs at an endpoint. This catches edges that cross the band while both
 * endpoints lie in the hole or outside the outer radius.
 */
export function checkAnnulusPolygonIntersection(
    center: Point2D,
    innerRadius: number,
    outerRadius: number,
    polygon: Polygon2D,
    eps = 1e-9,
): AnnulusPolygonIntersection {
    if (
        !Number.isFinite(innerRadius) ||
        !Number.isFinite(outerRadius) ||
        innerRadius < 0 ||
        outerRadius < innerRadius
    ) {
        throw new RangeError("Annulus radii must satisfy 0 <= innerRadius <= outerRadius (metres).");
    }

    const noIntersection: AnnulusPolygonIntersection = {
        intersects: false,
        vertexInBand: false,
        edgeInBand: false,
        polygonEnclosesBand: false,
    };
    if (!polygon || polygon.length === 0) return noIntersection;

    const lower = innerRadius - eps;
    const upper = outerRadius + eps;
    const radiusOf = (p: Point2D) => Math.hypot(p.x - center.x, p.y - center.y);

    let vertexInBand = false;
    for (const point of polygon) {
        const radius = radiusOf(point);
        if (radius >= lower && radius <= upper) vertexInBand = true;
    }

    let edgeInBand = false;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        const minRadius = pointToSegmentDistance(center, a, b);
        const maxRadius = Math.max(radiusOf(a), radiusOf(b));
        if (minRadius <= upper && maxRadius >= lower) edgeInBand = true;
    }

    let polygonEnclosesBand = false;
    if (!vertexInBand && !edgeInBand) {
        // The band is connected, so if no vertex or edge touches it the band is
        // either entirely inside the polygon or entirely outside it. A point in
        // the middle of the band therefore decides the containment case.
        const midRadius = (innerRadius + outerRadius) / 2;
        const sample = { x: center.x + midRadius, y: center.y };
        polygonEnclosesBand = pointInPolygon(sample, polygon, eps);
    }

    return {
        intersects: vertexInBand || edgeInBand || polygonEnclosesBand,
        vertexInBand,
        edgeInBand,
        polygonEnclosesBand,
    };
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
    checkAnnulusPolygonIntersection,
};
