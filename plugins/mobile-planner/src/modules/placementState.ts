// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 — Mobile Crane Placement & Live State Wiring
// Owner: Ajit
// ============================================================================

import {
    CHART_RADII_M,
    type CranePointM,
    capacityAt,
    expectedRadiusM,
    KIT,
    radiusFromPoint,
} from "./craneModel";
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

/**
 * A single obstacle on the site for clearance checking.
 * Supports polygon footprints, vertical hazard planes (power lines), and point obstacles.
 *
 * @remarks
 * **2D (horizontal plan) only** — clearance is evaluated in the top-down XY plan view.
 * Building heights and vertical boom elevation are NOT considered; this module does not
 * perform 3D sweep or vertical clearance checks. For 3D clearance see M6 (computeSiteClearance).
 */
export interface SiteObstacle {
    /** Human-readable label (e.g. "Tower A", "22 kV power line"). */
    readonly label: string;
    /** Required minimum clearance in metres (INDICATIVE unless sourced from a verified engineering document). */
    readonly requiredClearanceM: number;
    /**
     * 2D polygonal footprint in metres as [[x0, y0], [x1, y1], ...] pairs.
     *
     * @remarks
     * **Horizontal plan clearance only.**  Clearance is computed as the shortest 2D distance
     * from the projected boom-tip position to the polygon boundary.  Building height (heightM)
     * and boom elevation are NOT included in this calculation.  Future contributors must NOT
     * assume that vertical clearance is already covered here.
     */
    readonly polygon?: readonly (readonly [number, number])[];
    /**
     * Obstacle height in metres — for display and future 3D integration only.
     *
     * @remarks
     * **This field is NOT used in the M8 clearance calculation.**  The current implementation
     * is 2D (horizontal plan) only.  Height data is stored here so that a future 3D module
     * (e.g. M6/M7 swing-sweep) can consume it without a schema change.
     */
    readonly heightM?: number;
    /**
     * Infinite vertical hazard plane at a fixed X coordinate in metres (east-positive).
     *
     * Coordinate system: X = east (right in plan view), Y = north (up in plan view).
     *
     * Any slew direction that places the boom-tip X coordinate on the far side of this plane
     * is treated as an intersection (distanceM = 0, isCollision = true), regardless of
     * boom length or slew angle.  This models an overhead power line as a conservative
     * infinite vertical wall spanning +-infinity in Y and Z — the most restrictive safe assumption.
     *
     * Clearance = (absolute X distance from boom tip to this plane) minus equiredClearanceM.
     * A negative clearance means the required exclusion zone is violated.
     */
    readonly xLineM?: number;
    /** Single obstacle centre X in metres (legacy / point obstacles). */
    readonly xM?: number;
    /** Single obstacle centre Y in metres (legacy / point obstacles). */
    readonly yM?: number;
}

/** Result of a single obstacle clearance check. */
export interface ObstacleClearanceResult {
    readonly label: string;
    /** 2D horizontal distance from boom to obstacle in metres. */
    readonly distanceM: number;
    /** Required clearance in metres. */
    readonly requiredClearanceM: number;
    /** Operating radius of the boom tip in metres. */
    readonly boomTipRadiusM: number;
    /** Horizontal gap = distance - requiredClearance. Positive = safe margin; negative = violation. */
    readonly marginM: number;
    readonly status: "PASS" | "FAIL";
    /** True if boom physically intersects or penetrates obstacle volume/hazard plane. */
    readonly isCollision: boolean;
}

export type OverallVerdict = "ALL PASS" | "FAIL" | "INCOMPLETE";

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
    /** Ground bearing status: PASS, FAIL or NOT_CHECKED. */
    readonly bearingStatus: "PASS" | "FAIL" | "NOT_CHECKED";
    /** Per-obstacle clearance results (empty if no obstacles supplied). */
    readonly obstacleClearances: readonly ObstacleClearanceResult[];
    /** Overall clearance status across all obstacles: PASS, FAIL or NOT_CHECKED. */
    readonly clearanceStatus: "PASS" | "FAIL" | "NOT_CHECKED";
    /** Overall safety verdict: ALL PASS only when capacity, stability, bearing, and clearance all pass. */
    readonly overallVerdict: OverallVerdict;
    /** Backwards-compatible flag: true ONLY when overallVerdict === "ALL PASS". */
    readonly allPass: boolean;
    /** Explanatory reasons when overallVerdict is INCOMPLETE. */
    readonly incompleteReasons: readonly string[];
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
// Input Validation
// ---------------------------------------------------------------------------

/**
 * Validates placement input. Returns list of human-readable error messages.
 * An empty list means input is valid.
 */
export function validatePlacementInput(input: MobilePlacementInput): string[] {
    const errs: string[] = [];
    if (!Number.isFinite(input.craneCentreXM)) errs.push("Crane Centre X must be a finite number");
    if (!Number.isFinite(input.craneCentreYM)) errs.push("Crane Centre Y must be a finite number");
    if (!Number.isFinite(input.slewAngleDeg)) errs.push("Slew angle must be a finite number");
    if (!Number.isFinite(input.boomLengthM) || input.boomLengthM <= 0) {
        errs.push("Boom length must be positive");
    }
    if (!Number.isFinite(input.boomAngleDeg) || input.boomAngleDeg < 0 || input.boomAngleDeg > 90) {
        errs.push("Boom angle must be between 0° and 90°");
    }
    if (!Number.isFinite(input.payloadT) || input.payloadT < 0) {
        errs.push("Payload must be non-negative");
    }
    if (!Number.isFinite(input.riggingT) || input.riggingT < 0) {
        errs.push("Rigging weight must be non-negative");
    }
    if (!Number.isFinite(input.craneWeightT) || input.craneWeightT <= 0) {
        errs.push("Crane self-weight must be positive");
    }
    if (!Number.isFinite(input.outriggerLengthSpreadM) || input.outriggerLengthSpreadM <= 0) {
        errs.push("Outrigger L spread must be positive");
    }
    if (!Number.isFinite(input.outriggerWidthSpreadM) || input.outriggerWidthSpreadM <= 0) {
        errs.push("Outrigger W spread must be positive");
    }
    if (!Number.isFinite(input.padAreaM2) || input.padAreaM2 <= 0) {
        errs.push("Pad area must be positive");
    }
    if (
        input.allowableBearingT_M2 !== undefined &&
        (!Number.isFinite(input.allowableBearingT_M2) || input.allowableBearingT_M2 <= 0)
    ) {
        errs.push("Allowable ground bearing must be positive if specified");
    }
    return errs;
}

// ---------------------------------------------------------------------------
// 2D Geometric Distance Helpers
// ---------------------------------------------------------------------------

function distancePointToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
}

function segmentsIntersect(
    a1x: number,
    a1y: number,
    a2x: number,
    a2y: number,
    b1x: number,
    b1y: number,
    b2x: number,
    b2y: number,
): boolean {
    function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
        return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
    }
    const ccw1 = ccw(a1x, a1y, a2x, a2y, b1x, b1y);
    const ccw2 = ccw(a1x, a1y, a2x, a2y, b2x, b2y);
    const ccw3 = ccw(b1x, b1y, b2x, b2y, a1x, a1y);
    const ccw4 = ccw(b1x, b1y, b2x, b2y, a2x, a2y);

    if (
        ((ccw1 > 0 && ccw2 < 0) || (ccw1 < 0 && ccw2 > 0)) &&
        ((ccw3 > 0 && ccw4 < 0) || (ccw3 < 0 && ccw4 > 0))
    ) {
        return true;
    }
    return false;
}

function distanceSegmentToSegment(
    a1x: number,
    a1y: number,
    a2x: number,
    a2y: number,
    b1x: number,
    b1y: number,
    b2x: number,
    b2y: number,
): number {
    if (segmentsIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y)) {
        return 0;
    }
    return Math.min(
        distancePointToSegment(a1x, a1y, b1x, b1y, b2x, b2y),
        distancePointToSegment(a2x, a2y, b1x, b1y, b2x, b2y),
        distancePointToSegment(b1x, b1y, a1x, a1y, a2x, a2y),
        distancePointToSegment(b2x, b2y, a1x, a1y, a2x, a2y),
    );
}

function pointInPolygon(px: number, py: number, poly: readonly (readonly [number, number])[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0];
        const yi = poly[i][1];
        const xj = poly[j][0];
        const yj = poly[j][1];
        const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function distanceSegmentToPolygon(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    poly: readonly (readonly [number, number])[],
): number {
    if (poly.length === 0) return Infinity;
    if (pointInPolygon(x1, y1, poly) || pointInPolygon(x2, y2, poly)) {
        return 0;
    }
    let minD = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const ex1 = poly[j][0];
        const ey1 = poly[j][1];
        const ex2 = poly[i][0];
        const ey2 = poly[i][1];
        const d = distanceSegmentToSegment(x1, y1, x2, y2, ex1, ey1, ex2, ey2);
        if (d === 0) return 0;
        if (d < minD) minD = d;
    }
    return minD;
}

// ---------------------------------------------------------------------------
// Core reactive computation (single-tick, synchronous)
// ---------------------------------------------------------------------------

/**
 * Computes the full placement result from one set of inputs plus site obstacles.
 * Single source of truth: all outputs are derived from input in the same tick.
 *
 * Acceptance test (BACKLOG.md M8):
 *   "Move the crane and capacity, pad loads and clearance all update;
 *    no stale value."
 */
export function computePlacement(
    input: MobilePlacementInput,
    obstacles: readonly SiteObstacle[] = [],
): MobilePlacementResult {
    const validationErrors = validatePlacementInput(input);
    if (validationErrors.length > 0) {
        throw new Error(`Invalid placement input: ${validationErrors.join("; ")}`);
    }

    // --- 1. Operating radius from boom geometry ---
    const operatingRadiusM = expectedRadiusM(input.boomLengthM, input.boomAngleDeg);

    // --- 2. Capacity lookup from KIT chart ---
    let lookupRadiusM: number | undefined;
    for (const r of CHART_RADII_M) {
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

    // --- 4. Outrigger pad reactions ---
    const padReactions = calculatePadReactionsFromLift({
        craneWeightT: input.craneWeightT,
        liftedLoadT: totalSuspendedLoadT,
        radiusM: operatingRadiusM,
        slewAngleDeg: input.slewAngleDeg,
        lengthSpreadM: input.outriggerLengthSpreadM,
        widthSpreadM: input.outriggerWidthSpreadM,
    });

    // --- 5. Ground bearing on worst pad ---
    const worstPadBearing = calculateGroundBearing(
        padReactions.maxReactionT,
        input.padAreaM2,
        input.allowableBearingT_M2,
    );
    const bearingStatus = worstPadBearing.status;

    // --- 6. Boom segment coordinates in 2D plan ---
    const rad = (input.slewAngleDeg * Math.PI) / 180;
    const cosSlew = Math.cos(rad);
    const sinSlew = Math.sin(rad);

    // Boom pivot at crane centre + PIVOT_OFFSET_M along slew direction
    const boomFootX = input.craneCentreXM + KIT.PIVOT_OFFSET_M * cosSlew;
    const boomFootY = input.craneCentreYM + KIT.PIVOT_OFFSET_M * sinSlew;
    // Boom tip at crane centre + operatingRadiusM along slew direction
    const boomTipX = input.craneCentreXM + operatingRadiusM * cosSlew;
    const boomTipY = input.craneCentreYM + operatingRadiusM * sinSlew;

    // --- 7. Obstacle clearances (Polygon, Power Line wall, Point) ---
    const obstacleClearances: ObstacleClearanceResult[] = obstacles.map((obs) => {
        let distanceM: number;
        let isCollision = false;

        if (obs.polygon && obs.polygon.length >= 3) {
            // Polygon footprint obstacle (e.g. Tower A building)
            distanceM = distanceSegmentToPolygon(boomFootX, boomFootY, boomTipX, boomTipY, obs.polygon);
            if (distanceM <= 1e-4) {
                distanceM = 0;
                isCollision = true;
            }
        } else if (obs.xLineM !== undefined) {
            // Infinite vertical plane hazard (e.g. 22 kV power line at x = -9 m)
            const minBoomX = Math.min(boomFootX, boomTipX);
            const maxBoomX = Math.max(boomFootX, boomTipX);
            if (minBoomX <= obs.xLineM && obs.xLineM <= maxBoomX) {
                distanceM = 0;
                isCollision = true;
            } else {
                distanceM = Math.min(Math.abs(boomFootX - obs.xLineM), Math.abs(boomTipX - obs.xLineM));
            }
        } else if (obs.xM !== undefined && obs.yM !== undefined) {
            // Point obstacle
            distanceM = distancePointToSegment(obs.xM, obs.yM, boomFootX, boomFootY, boomTipX, boomTipY);
        } else {
            distanceM = Infinity;
        }

        const marginM = distanceM - obs.requiredClearanceM;
        const status = marginM >= 0 && !isCollision ? ("PASS" as const) : ("FAIL" as const);

        return {
            label: obs.label,
            distanceM,
            requiredClearanceM: obs.requiredClearanceM,
            boomTipRadiusM: operatingRadiusM,
            marginM,
            status,
            isCollision,
        };
    });

    const clearanceStatus: "PASS" | "FAIL" | "NOT_CHECKED" =
        obstacles.length === 0
            ? "NOT_CHECKED"
            : obstacleClearances.some((c) => c.status === "FAIL")
              ? "FAIL"
              : "PASS";

    // --- 8. Overall Safety Verdict ---
    const incompleteReasons: string[] = [];
    if (capacityStatus === "NO_DATA") {
        incompleteReasons.push("Capacity outside chart");
    }
    if (bearingStatus === "NOT_CHECKED") {
        incompleteReasons.push("Ground bearing not checked (allowable bearing required)");
    }
    if (clearanceStatus === "NOT_CHECKED") {
        incompleteReasons.push("Clearance not checked (no obstacles provided)");
    }

    let overallVerdict: OverallVerdict;
    if (
        capacityStatus === "FAIL" ||
        !padReactions.isStable ||
        bearingStatus === "FAIL" ||
        clearanceStatus === "FAIL"
    ) {
        overallVerdict = "FAIL";
    } else if (
        capacityStatus === "PASS" &&
        padReactions.isStable &&
        bearingStatus === "PASS" &&
        clearanceStatus === "PASS"
    ) {
        overallVerdict = "ALL PASS";
    } else {
        overallVerdict = "INCOMPLETE";
    }

    const allPass = overallVerdict === "ALL PASS";

    return {
        input,
        operatingRadiusM,
        capacityT,
        totalSuspendedLoadT,
        utilisation,
        capacityStatus,
        padReactions,
        worstPadBearing,
        bearingStatus,
        obstacleClearances,
        clearanceStatus,
        overallVerdict,
        allPass,
        incompleteReasons,
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
