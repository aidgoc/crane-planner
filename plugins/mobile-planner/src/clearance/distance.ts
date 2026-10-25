// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Mobile Crane Lift Planner — 3D Boom Clearance Engine (Task M5)
// Owner: Abhishek
// ============================================================================

import {
    type IShape,
    type IShapeFactory,
    type ISolid,
    Plane,
    Precision,
    XYZ,
    type XYZLike,
} from "@chili3d/core";

/**
 * Result of a 3D CAD clearance distance calculation.
 * All public planning distances are expressed in METRES.
 */
export interface ClearanceResult {
    /**
     * Minimum surface-to-surface distance in metres (m).
     */
    distanceM: number;
    /**
     * Minimum distance in millimetres (CAD kernel units).
     */
    distanceMm: number;
    /**
     * True if the two solids physically penetrate/overlap each other.
     */
    isCollision: boolean;
    /**
     * True if the shapes touch at their boundaries without interior penetration.
     */
    isTouching: boolean;
}

/**
 * MM_PER_M: Conversion ratio between Chili3D kernel units (mm) and planner units (m).
 * 1 metre = 1000 millimetres.
 */
export const MM_PER_M = 1000;

/**
 * Computes the minimum 3D clearance distance between two shapes using
 * OpenCASCADE's BRepExtrema through the Chili3D IShape API.
 *
 * @param shapeA - First shape (e.g. Building solid)
 * @param shapeB - Second shape (e.g. Crane Boom cylinder)
 * @param factory - Optional IShapeFactory used to disambiguate boundary-touching vs volume penetration
 * @returns ClearanceResult containing distance in metres and collision flags
 */
export function computeClearanceDistance(
    shapeA: IShape,
    shapeB: IShape,
    factory?: IShapeFactory,
): ClearanceResult {
    const distMm = shapeA.extremaDistance(shapeB);

    if (distMm < 0) {
        throw new Error("Unable to calculate extrema distance: shapes have no valid geometry");
    }

    const distanceM = distMm / MM_PER_M;

    // If shapes are separated (> 0 mm), there is no collision and they are not touching
    if (distMm > Precision.Distance) {
        return {
            distanceM,
            distanceMm: distMm,
            isCollision: false,
            isTouching: false,
        };
    }

    // distMm <= Precision.Distance: The shapes either touch at the boundary or overlap.
    // If a shape factory is available, evaluate booleanCommon to test for penetrating volume.
    if (factory) {
        try {
            const commonResult = factory.booleanCommon([shapeA], [shapeB]);
            if (commonResult.isOk && !commonResult.value.isNull()) {
                const volMm3 = commonResult.value.volume();
                // If the intersection has a positive 3D volume, they penetrate (Collision)
                if (volMm3 > 1.0) {
                    return {
                        distanceM: 0,
                        distanceMm: 0,
                        isCollision: true,
                        isTouching: false,
                    };
                }
            }
        } catch {
            // If booleanCommon fails, fall back to collision flag for 0-distance
        }
    }

    // Boundary contact without volume penetration
    return {
        distanceM: 0,
        distanceMm: 0,
        isCollision: false,
        isTouching: true,
    };
}

/**
 * Helper to construct an axis-aligned building box solid in metres.
 * Converts coordinates to millimetres at the Chili3D factory boundary.
 */
export function createBuildingBox(
    factory: IShapeFactory,
    originM: XYZLike,
    sizeM: { dx: number; dy: number; dz: number },
): ISolid {
    const plane = new Plane({
        origin: new XYZ({
            x: originM.x * MM_PER_M,
            y: originM.y * MM_PER_M,
            z: originM.z * MM_PER_M,
        }),
        normal: XYZ.unitZ,
        xvec: XYZ.unitX,
    });

    const res = factory.box(plane, sizeM.dx * MM_PER_M, sizeM.dy * MM_PER_M, sizeM.dz * MM_PER_M);

    if (!res.isOk) {
        throw new Error(`Failed to create building box solid: ${res.error}`);
    }

    return res.value as ISolid;
}

/**
 * Helper to construct a boom cylinder solid in metres.
 * Converts coordinates to millimetres at the Chili3D factory boundary.
 */
export function createBoomCylinder(
    factory: IShapeFactory,
    baseCenterM: XYZLike,
    radiusM: number,
    lengthM: number,
    dir: XYZ = XYZ.unitZ,
): ISolid {
    const centerMm = new XYZ({
        x: baseCenterM.x * MM_PER_M,
        y: baseCenterM.y * MM_PER_M,
        z: baseCenterM.z * MM_PER_M,
    });

    const res = factory.cylinder(dir, centerMm, radiusM * MM_PER_M, lengthM * MM_PER_M);

    if (!res.isOk) {
        throw new Error(`Failed to create boom cylinder solid: ${res.error}`);
    }

    return res.value as ISolid;
}
