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
 * The site-model stores the power line geometry and clearance_m requirement.
 * Downstream physical evaluation against dynamic crane parts is handled by:
 * - Mobile Planner (M6/M8): checks boom cylinder extrema distance against line corridor.
 * - Tower Planner (T8): checks slew circle buffer against line corridor.
 *
 * @param powerLine - Power line specification from site model.
 * @param xM - Horizontal position X in metres.
 * @param additionalRadiusM - Optional boom or slew radius in metres to test.
 */
export function checkPowerLineClearance(
    powerLine: PowerLineZone,
    xM: number,
    additionalRadiusM = 0,
): PowerLineClearanceResult {
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
