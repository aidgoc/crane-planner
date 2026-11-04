// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 — Mobile Crane Placement & Live State Wiring
// Owner: Ajit
// ============================================================================

import { type CranePointM, capacityAt, expectedRadiusM, radiusFromPoint } from "./craneModel";
import {
    calculateGroundBearing,
    calculatePadReactionsFromLift,
    type GroundBearingResult,
    type PadReactionsResult,
    PLANNING_DISCLAIMER,
} from "./outriggers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** User-editable inputs for a single mobile crane placement on the site. */
export interface MobilePlacementInput {
    /** Crane centre X on the site plan in metres. */
    readonly craneCentreXM: number;
    /** Crane centre Y on the site plan in metres. */
    readonly craneCentreYM: number;
    /** Slew angle in degrees (0 = front / +X, CCW positive). */
    readonly slewAngleDeg: number;
    /** Selected boom length in metres (must match a chart row). */
    readonly boomLengthM: number;
    /** Boom angle from horizontal in degrees (0–90). */
    readonly boomAngleDeg: number;
    /** Payload (hook load) in tonnes (user input). */
    readonly payloadT: number;
    /** Rigging / hook block mass in tonnes (user input, default 0). */
    readonly riggingT: number;
    /** Crane self-weight (carrier + superstructure + counterweight) in tonnes (user input). */
    readonly craneWeightT: number;
    /** Longitudinal outrigger spread in metres (user input). */
    readonly outriggerLengthSpreadM: number;
    /** Transverse outrigger spread in metres (user input). */
    readonly outriggerWidthSpreadM: number;
    /** Outrigger pad area in m² (user input). */
    readonly padAreaM2: number;
    /** Allowable ground bearing capacity in t/m² (user input, undefined = not checked). */
    readonly allowableBearingT_M2?: number;
}

/** A single obstacle on the site for clearance checking. */
export interface SiteObstacle {
    /** Human-readable label (e.g. "Tower A", "22 kV power line"). */
    readonly label: string;
    /** Obstacle centre X in metres. */
    readonly xM: number;
    /** Obstacle centre Y in metres. */
    readonly yM: number;
    /** Required minimum clearance in metres (INDICATIVE unless sourced). */
    readonly requiredClearanceM: number;
}

/** Result of a single obstacle clearance check. */
export interface ObstacleClearanceResult {
    readonly label: string;
    /** 2D horizontal distance from crane centre to obstacle centre in metres. */
    readonly distanceM: number;
    /** Required clearance in metres. */
    readonly requiredClearanceM: number;
    /** Operating radius of the boom tip in metres. */
    readonly boomTipRadiusM: number;
    /** Horizontal gap = distance - boomTipRadius - requiredClearance.
     *  Positive = safe margin; negative = violation. */
    readonly marginM: number;
    readonly status: "PASS" | "FAIL";
}

/** Full computed state after one reactive tick. */
export interface MobilePlacementResult {
    readonly input: MobilePlacementInput;
    /** Operating radius in metres (from slew centre, including PIVOT_OFFSET). */
    readonly operatingRadiusM: number;
    /** Chart capacity at the selected boom length and radius (null = outside chart). */
    readonly capacityT: number | null;
    /** Total suspended load = payload + rigging. */
    readonly totalSuspendedLoadT: number;
    /** Utilisation = totalSuspendedLoad / capacity (0–1+), null if no capacity. */
    readonly utilisation: number | null;
    /** Capacity verdict. */
    readonly capacityStatus: "PASS" | "FAIL" | "NO_DATA";
    /** Outrigger pad reactions. */
    readonly padReactions: PadReactionsResult;
    /** Ground bearing for the worst (heaviest) pad. */
    readonly worstPadBearing: GroundBearingResult;
    /** Per-obstacle clearance results (empty if no obstacles supplied). */
    readonly obstacleClearances: readonly ObstacleClearanceResult[];
    /** Overall verdict: true only when capacity PASS, stable and no clearance FAIL. */
    readonly allPass: boolean;
    readonly disclaimer: typeof PLANNING_DISCLAIMER;
}

// ---------------------------------------------------------------------------
// INDICATIVE defaults (no crane spec sourced for self-weight or outrigger spread)
// ---------------------------------------------------------------------------

/**
 * Returns a sensible INDICATIVE default input.  Every field is labelled
 * INDICATIVE in the guide and in the UI; users must replace them with
 * their own site-specific numbers.
 */
export function createDefaultPlacementInput(): MobilePlacementInput {
    return {
        craneCentreXM: 0,
        craneCentreYM: 0,
        slewAngleDeg: 0,
        boomLengthM: 38, // middle chart row — INDICATIVE
        boomAngleDeg: 60,
        payloadT: 10,
        riggingT: 0.5,
        craneWeightT: 84, // INDICATIVE, Grove GMK5250L-1 carrier weight not sourced here
        outriggerLengthSpreadM: 7.7, // INDICATIVE
        outriggerWidthSpreadM: 7.2, // INDICATIVE
        padAreaM2: 1.0, // INDICATIVE 1 m × 1 m timber mat
        allowableBearingT_M2: undefined,
    };
}

// ---------------------------------------------------------------------------
// Core reactive computation (single-tick, synchronous)
// ---------------------------------------------------------------------------

/**
 * Computes the full placement result from one set of inputs plus optional
 * site obstacles.  This is the "single source of truth" that the UI panel
 * calls on every input change.  No stale values: every output is derived
 * from the supplied input in the same synchronous call.
 *
 * Acceptance test (BACKLOG.md M8):
 *   "Move the crane and capacity, pad loads and clearance all update;
 *    no stale value."
 */
export function computePlacement(
    input: MobilePlacementInput,
    obstacles: readonly SiteObstacle[] = [],
): MobilePlacementResult {
    // --- 1. Operating radius from boom geometry (Rushikesh's module) ---
    const operatingRadiusM = expectedRadiusM(input.boomLengthM, input.boomAngleDeg);

    // --- 2. Capacity lookup (Rushikesh's chart) ---
    // The chart uses discrete boom / radius cells.  Find the chart radius
    // that is >= operatingRadiusM (conservative: capacity decreases with radius).
    const chartRadii = [5, 8, 10, 11, 12, 15, 20, 30] as const;
    let lookupRadiusM: number | undefined;
    for (const r of chartRadii) {
        if (r >= operatingRadiusM) {
            lookupRadiusM = r;
            break;
        }
    }
    const capacityT = lookupRadiusM !== undefined ? capacityAt(input.boomLengthM, lookupRadiusM) : null;

    // --- 3. Utilisation ---
    const totalSuspendedLoadT = input.payloadT + input.riggingT;
    const utilisation = capacityT !== null && capacityT > 0 ? totalSuspendedLoadT / capacityT : null;

    let capacityStatus: "PASS" | "FAIL" | "NO_DATA";
    if (capacityT === null) {
        capacityStatus = "NO_DATA";
    } else if (totalSuspendedLoadT <= capacityT) {
        capacityStatus = "PASS";
    } else {
        capacityStatus = "FAIL";
    }

    // --- 4. Outrigger pad reactions (Sujal's module) ---
    const padReactions = calculatePadReactionsFromLift({
        craneWeightT: input.craneWeightT,
        liftedLoadT: totalSuspendedLoadT,
        radiusM: operatingRadiusM,
        slewAngleDeg: input.slewAngleDeg,
        lengthSpreadM: input.outriggerLengthSpreadM,
        widthSpreadM: input.outriggerWidthSpreadM,
    });

    // --- 5. Ground bearing on worst pad (Sujal's module) ---
    const worstPadBearing = calculateGroundBearing(
        padReactions.maxReactionT,
        input.padAreaM2,
        input.allowableBearingT_M2,
    );

    // --- 6. 2D obstacle clearances ---
    const obstacleClearances: ObstacleClearanceResult[] = obstacles.map((obs) => {
        const dx = obs.xM - input.craneCentreXM;
        const dy = obs.yM - input.craneCentreYM;
        const distanceM = Math.hypot(dx, dy);
        const marginM = distanceM - operatingRadiusM - obs.requiredClearanceM;
        return {
            label: obs.label,
            distanceM,
            requiredClearanceM: obs.requiredClearanceM,
            boomTipRadiusM: operatingRadiusM,
            marginM,
            status: marginM >= 0 ? ("PASS" as const) : ("FAIL" as const),
        };
    });

    // --- 7. Overall verdict ---
    const allPass =
        capacityStatus === "PASS" &&
        padReactions.isStable &&
        (worstPadBearing.status === "PASS" || worstPadBearing.status === "NOT_CHECKED") &&
        obstacleClearances.every((c) => c.status === "PASS");

    return {
        input,
        operatingRadiusM,
        capacityT,
        totalSuspendedLoadT,
        utilisation,
        capacityStatus,
        padReactions,
        worstPadBearing,
        obstacleClearances,
        allPass,
        disclaimer: PLANNING_DISCLAIMER,
    };
}

/**
 * Convenience: compute radius from a pick/set point relative to crane centre.
 */
export function pickRadiusM(craneCentre: CranePointM, pickPoint: CranePointM): number {
    return radiusFromPoint({
        xM: pickPoint.xM - craneCentre.xM,
        yM: pickPoint.yM - craneCentre.yM,
    });
}
