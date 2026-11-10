// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type Point2D, type Polygon2D, pointInPolygon, pointToPolygonDistance } from "./clearance";

export interface BoundaryOversailResult {
    readonly mastInside: boolean;
    readonly distanceToBoundary: number;
    readonly oversailDepth: number;
    readonly intersects: boolean;
}

export function checkBoundaryOversail(
    center: Point2D,
    swingRadius: number,
    boundary: Polygon2D,
    eps = 1e-9,
): BoundaryOversailResult {
    const mastInside = pointInPolygon(center, boundary, eps);
    const distanceToBoundary = pointToPolygonDistance(center, boundary);
    const oversailDepth = Math.max(0, swingRadius - distanceToBoundary);
    return {
        mastInside,
        distanceToBoundary,
        oversailDepth: oversailDepth <= eps ? 0 : oversailDepth,
        intersects: !mastInside || oversailDepth > eps,
    };
}

export interface BandOversailResult {
    readonly distanceToBand: number;
    readonly oversailDepth: number;
    readonly intersects: boolean;
}

export function checkHorizontalBandOversail(
    center: Point2D,
    swingRadius: number,
    yFrom: number,
    yTo: number,
    eps = 1e-9,
): BandOversailResult {
    const low = Math.min(yFrom, yTo);
    const high = Math.max(yFrom, yTo);
    let distanceToBand: number;
    if (center.y < low) {
        distanceToBand = low - center.y;
    } else if (center.y > high) {
        distanceToBand = center.y - high;
    } else {
        distanceToBand = 0;
    }

    const oversailDepth = Math.max(0, swingRadius - distanceToBand);
    return {
        distanceToBand,
        oversailDepth: oversailDepth <= eps ? 0 : oversailDepth,
        intersects: oversailDepth > eps,
    };
}

export interface CircleOverlapResult {
    readonly centreDistance: number;
    readonly overlapDepth: number;
    readonly intersects: boolean;
}

export function checkCircleOverlap(
    a: Point2D,
    radiusA: number,
    b: Point2D,
    radiusB: number,
    eps = 1e-9,
): CircleOverlapResult {
    const centreDistance = Math.hypot(a.x - b.x, a.y - b.y);
    const overlapDepth = Math.max(0, radiusA + radiusB - centreDistance);
    return {
        centreDistance,
        overlapDepth: overlapDepth <= eps ? 0 : overlapDepth,
        intersects: overlapDepth > eps,
    };
}
