// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// S1/S3 — Hazard Clearance Utility & Downstream Interface
// Owner: Ajit
// ============================================================================

import type { PowerLineZone } from "./types";

/**
 * Result of evaluating proximity to an overhead power line corridor.
 */
export interface PowerLineClearanceResult {
    /** Horizontal distance from point X to power line axis in metres. */
    readonly distanceM: number;
    /** Required safety clearance in metres (stored on PowerLineZone). */
    readonly requiredClearanceM: number;
    /** Safety margin = distance - requiredClearance. Positive is safe; negative is violated. */
    readonly marginM: number;
    /** True if distance is strictly less than required safety clearance. */
    readonly isViolated: boolean;
}

/**
 * Evaluates whether a given horizontal position violates the overhead power line
 * clearance zone.
 *
 * NOTE ON DOWNSTREAM APPLICATION:
 * This is a simple x-only screening helper (evaluates horizontal X plan distance; wire height
 * and vertical 3D geometry are not evaluated). For full 3D solid clearance against power lines,
 * use M6 computeSiteClearance.
 *
 * Downstream physical evaluation against dynamic crane parts is handled by:
 * - Mobile Planner (M6/M8): checks boom cylinder extrema distance against line corridor.
 * - Tower Planner (T8): checks slew circle buffer against line corridor.
 *
 * @param powerLine - Power line specification from site model.
 * @param xM - Horizontal position X in metres.
 * @param additionalRadiusM - Optional boom or slew radius in metres to test (must be non-negative).
 * @throws {RangeError} If xM, additionalRadiusM, or clearance_m is non-finite or negative.
 */
export function checkPowerLineClearance(
    powerLine: PowerLineZone,
    xM: number,
    additionalRadiusM = 0,
): PowerLineClearanceResult {
    if (!Number.isFinite(xM)) {
        throw new RangeError(`Power line clearance check: xM must be a finite number, got ${xM}`);
    }
    if (!Number.isFinite(additionalRadiusM) || additionalRadiusM < 0) {
        throw new RangeError(
            `Power line clearance check: additionalRadiusM must be a non-negative finite number, got ${additionalRadiusM}`,
        );
    }
    if (!Number.isFinite(powerLine.clearance_m) || powerLine.clearance_m < 0) {
        throw new RangeError(
            `Power line clearance check: clearance_m must be a non-negative finite number, got ${powerLine.clearance_m}`,
        );
    }

    const rawDistanceM = Math.abs(xM - powerLine.x_m);
    const distanceM = Math.max(0, rawDistanceM - additionalRadiusM);
    const marginM = distanceM - powerLine.clearance_m;
    return {
        distanceM,
        requiredClearanceM: powerLine.clearance_m,
        marginM,
        isViolated: marginM < 0,
    };
}
