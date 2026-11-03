// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Mobile Crane Lift Planner — M7: Swing sweep clearance
// Owner: Abhishek
// ============================================================================

import type { IShapeFactory } from "@chili3d/core";
import type {
    BoomPlacement,
    ObstacleClearanceResult,
    ObstacleFootprint,
    PowerLineObstacle,
    SiteClearanceReport,
} from "./siteClearance";
import { computeSiteClearance, validateBoomPlacement } from "./siteClearance";

// ============================================================================
// Public types
// ============================================================================

/**
 * One sample point in the sweep: the slew angle and the full site clearance
 * report at that angle.
 */
export interface SweepStep {
    /** Slew angle in degrees at this step. */
    slewDeg: number;
    /** Full site clearance report at this slew angle. */
    report: SiteClearanceReport;
}

/**
 * Result of sweeping the boom through a range of slew angles.
 *
 * The sweep samples the slew at regular intervals (inclusive of both endpoints)
 * and reports the worst clearance found across all angles and all obstacles.
 *
 * `worstStep` is `null` when:
 *  - no obstacles are defined (every step's report.worstCase is null), or
 *  - fromDeg === toDeg and there are no obstacles.
 * An empty sweep must NOT be treated as SAFE.
 *
 * Planning aid, not a certified lift plan.
 */
export interface SwingSweepReport {
    /** Pick (start) angle in degrees. */
    fromDeg: number;
    /** Set (end) angle in degrees. */
    toDeg: number;
    /** Step size used in degrees. */
    stepDeg: number;
    /** Number of angles sampled. */
    sampleCount: number;
    /** Per-step results, ordered by slew angle. */
    steps: SweepStep[];
    /**
     * The single worst obstacle result across the entire sweep.
     * `null` when no obstacles were checked — do NOT interpret as SAFE.
     */
    worstStep: {
        /** Slew angle at which the worst clearance occurs. */
        slewDeg: number;
        /** The worst obstacle result at that angle. */
        result: ObstacleClearanceResult;
    } | null;
    /** True if any step at any angle has a collision or touching. */
    anyCollision: boolean;
    disclaimer: "Planning aid, not a certified lift plan.";
}

// ============================================================================
// Input validation
// ============================================================================

/**
 * Largest number of slew angles one sweep may sample. Every sample runs a full
 * kernel clearance check, so a tiny step (for example 0.0001°) would build
 * hundreds of thousands of solids and hang the page. 5000 samples is 360° at
 * 0.1°, far finer than the BACKLOG M7 step of 2° to 5°. This is a project
 * limit, not a value from a standard.
 */
export const MAX_SWEEP_SAMPLES = 5000;

/**
 * Validates the sweep parameters before running any geometry.
 *
 * Rules:
 *  - stepDeg must be > 0 and finite (zero → infinite loop; negative → nonsense)
 *  - fromDeg and toDeg must be finite (NaN / Infinity → broken loop)
 *  - The sweep must not need more than MAX_SWEEP_SAMPLES angles
 *  - The base BoomPlacement is also validated (via validateBoomPlacement)
 *
 * Throws RangeError with a descriptive message.
 */
export function validateSweepParams(
    basePlacement: BoomPlacement,
    fromDeg: number,
    toDeg: number,
    stepDeg: number,
): void {
    // BoomPlacement validation (length, radius, elevation, pivot, etc.)
    // Temporarily override slewDeg to fromDeg for the validation — it will be
    // overwritten at each step anyway.
    validateBoomPlacement({ ...basePlacement, slewDeg: fromDeg });

    if (!Number.isFinite(stepDeg) || stepDeg <= 0) {
        throw new RangeError(
            `sweepSlew: stepDeg must be > 0 and finite (got ${stepDeg}). ` +
                `Zero causes an infinite loop; negative is nonsensical.`,
        );
    }
    if (!Number.isFinite(fromDeg)) {
        throw new RangeError(`sweepSlew: fromDeg must be finite (got ${fromDeg}).`);
    }
    if (!Number.isFinite(toDeg)) {
        throw new RangeError(`sweepSlew: toDeg must be finite (got ${toDeg}).`);
    }

    // Upper bound of generateSlewAngles(): the regular steps plus the endpoint.
    const sampleCount = Math.floor(Math.abs(toDeg - fromDeg) / stepDeg) + 2;
    if (sampleCount > MAX_SWEEP_SAMPLES) {
        throw new RangeError(
            `sweepSlew: step ${stepDeg}° over ${fromDeg}° to ${toDeg}° needs about ${sampleCount} samples, ` +
                `more than the limit of ${MAX_SWEEP_SAMPLES}. Use a larger step (BACKLOG M7 uses 2° to 5°).`,
        );
    }
}

// ============================================================================
// Main public API
// ============================================================================

/**
 * Generates the list of slew angles to sample, inclusive of both endpoints.
 *
 * The sweep always goes from `fromDeg` toward `toDeg` in `stepDeg` increments.
 * If `fromDeg === toDeg`, a single sample at that angle is returned.
 * The direction is determined automatically: if `toDeg < fromDeg`, the step is
 * applied in the negative direction.
 *
 * Angles are not wrapped. The sweep covers exactly the numeric range between the
 * two values, so 0° to 270° sweeps 270° (not the short 90° the other way), and
 * 350° to 10° sweeps 340° downwards (not 20° through 0°). Pass the arc the boom
 * really swings through.
 *
 * The final angle is always included even if the remaining arc is < stepDeg.
 *
 * @returns Array of slew angles in degrees, ordered from `fromDeg` to `toDeg`.
 */
export function generateSlewAngles(fromDeg: number, toDeg: number, stepDeg: number): number[] {
    if (fromDeg === toDeg) return [fromDeg];

    const direction = toDeg > fromDeg ? 1 : -1;
    const absStep = stepDeg; // stepDeg is always > 0 (validated)
    const totalArc = Math.abs(toDeg - fromDeg);
    const nSteps = Math.floor(totalArc / absStep);

    const angles: number[] = [];
    for (let i = 0; i <= nSteps; i++) {
        angles.push(fromDeg + i * direction * absStep);
    }

    // Ensure the endpoint is included (it may already be the last angle)
    const lastAngle = angles[angles.length - 1];
    if (Math.abs(lastAngle - toDeg) > 1e-9) {
        angles.push(toDeg);
    }

    return angles;
}

/**
 * Sweeps the boom through a range of slew angles and reports the worst
 * clearance to site obstacles at any sampled angle.
 *
 * This is the M7 (Swing Sweep) function: it evaluates the boom clearance
 * at every sampled slew between pick and set, and finds the angle where
 * the boom comes closest to an obstacle.
 *
 * BACKLOG acceptance:
 *   "Pick at 0° and set at 90°: worst-case angle and distance reported;
 *    changing step size (2°→5°) changes the answer by less than the
 *    10 cm tolerance."
 *
 * Limit: this samples the swing, it does not search it continuously. The true
 * closest angle can fall between two samples, and a very shallow intrusion
 * (about 1 cm) can fall between two samples of a coarse step. Example from the
 * tests: a 20 m boom tip reaching 1 cm past a wall at 180° is found as
 * CRITICAL with a 1° step, but a 5° step reports WARNING (0.009 m) and
 * `anyCollision = false`. WARNING and CRITICAL are both red, so the colour does
 * not change; keep the step at 2° to 5° as the BACKLOG says, and use a smaller
 * step (up to MAX_SWEEP_SAMPLES samples) when the gap is very small.
 *
 * @param factory - WASM-backed ShapeFactory.
 * @param basePlacement - Boom placement template (slewDeg is overridden per step).
 * @param fromDeg - Pick slew angle in degrees.
 * @param toDeg - Set slew angle in degrees.
 * @param stepDeg - Slew increment in degrees (must be > 0).
 * @param buildings - Building footprints from the site model.
 * @param powerLine - Optional power-line obstacle.
 * @returns SwingSweepReport.
 *
 * Planning aid, not a certified lift plan.
 */
export function sweepSlew(
    factory: IShapeFactory,
    basePlacement: BoomPlacement,
    fromDeg: number,
    toDeg: number,
    stepDeg: number,
    buildings: ObstacleFootprint[],
    powerLine?: PowerLineObstacle,
): SwingSweepReport {
    validateSweepParams(basePlacement, fromDeg, toDeg, stepDeg);

    const angles = generateSlewAngles(fromDeg, toDeg, stepDeg);
    const steps: SweepStep[] = [];

    // Status severity for comparison: lower number = more severe.
    const severity = (s: ObstacleClearanceResult["status"]) =>
        s === "CRITICAL" ? 0 : s === "WARNING" ? 1 : 2;

    let worstStep: SwingSweepReport["worstStep"] = null;
    let anyCollision = false;

    for (const angle of angles) {
        const placement: BoomPlacement = { ...basePlacement, slewDeg: angle };
        const report = computeSiteClearance(factory, placement, buildings, powerLine);

        steps.push({ slewDeg: angle, report });

        if (report.anyCollision) {
            anyCollision = true;
        }

        // Update worstStep: pick the result with the highest severity,
        // then the smallest distance.
        if (report.worstCase) {
            if (!worstStep) {
                worstStep = { slewDeg: angle, result: report.worstCase };
            } else {
                const currentSev = severity(worstStep.result.status);
                const newSev = severity(report.worstCase.status);
                if (
                    newSev < currentSev ||
                    (newSev === currentSev && report.worstCase.minDistanceM < worstStep.result.minDistanceM)
                ) {
                    worstStep = { slewDeg: angle, result: report.worstCase };
                }
            }
        }
    }

    return {
        fromDeg,
        toDeg,
        stepDeg,
        sampleCount: angles.length,
        steps,
        worstStep,
        anyCollision,
        disclaimer: "Planning aid, not a certified lift plan.",
    };
}
