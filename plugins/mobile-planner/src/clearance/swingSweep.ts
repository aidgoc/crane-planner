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
import { checkPreparedObstacles, prepareObstacles, validateBoomPlacement } from "./siteClearance";

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
    /** Largest gap between two neighbouring sampled angles, in degrees. */
    maxAngleGapDeg: number;
    /**
     * The most any boom point can move between a sampled angle and an angle
     * between two samples (m). See `betweenSamplesAllowanceM`.
     */
    betweenSamplesAllowanceM: number;
    /**
     * Lower bound of the clearance over the WHOLE swing, not only at the samples:
     * the smallest sampled distance of an obstacle minus `betweenSamplesAllowanceM`,
     * the lowest value over all obstacles. It can be negative, which means a
     * collision between two samples cannot be excluded. `null` when no obstacles
     * were checked.
     */
    guaranteedMinDistanceM: number | null;
    /**
     * Verdict for the whole swing, including the angles between the samples:
     *  - CRITICAL: a sampled angle collides or touches.
     *  - WARNING:  a sampled angle is inside the clearance limit, OR the samples are
     *              clear but the gap between samples is too large to prove the swing
     *              is clear (guaranteed distance below the limit, or not above 0).
     *              Shown red, like M6.
     *  - SAFE:     every obstacle is clear by at least its limit (and above 0) over the
     *              whole swing, proved with the between-samples allowance.
     *  - null:     no obstacles were checked. Never SAFE.
     */
    sweepStatus: "SAFE" | "WARNING" | "CRITICAL" | null;
    /** One sentence that says why `sweepStatus` has its value. */
    sweepStatusNote: string;
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
 * Checks the angle range and the step. Shared by `generateSlewAngles` (which is
 * exported and can be called on its own) and `validateSweepParams`.
 *  - stepDeg must be > 0 and finite (zero would loop forever; negative or NaN
 *    would give an empty list)
 *  - fromDeg and toDeg must be finite
 */
function assertAngleRange(fromDeg: number, toDeg: number, stepDeg: number): void {
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
}

/** A last regular sample within this fraction of a step of `toDeg` counts as `toDeg`. */
const END_TOLERANCE = 1e-9;

/**
 * Exact number of angles `generateSlewAngles` returns, without building them.
 * Used for the MAX_SWEEP_SAMPLES check, so the check and the list always agree.
 * Call `assertAngleRange` first.
 */
function planSlewAngles(
    fromDeg: number,
    toDeg: number,
    stepDeg: number,
): { count: number; nSteps: number; endIsRegular: boolean } {
    if (fromDeg === toDeg) return { count: 1, nSteps: 0, endIsRegular: true };
    const arc = Math.abs(toDeg - fromDeg);
    const nSteps = Math.floor(arc / stepDeg + END_TOLERANCE);
    // With nSteps = 0 the only regular sample is fromDeg, so toDeg is always added,
    // even for a tiny but non-zero sweep.
    const endIsRegular = nSteps > 0 && Math.abs(arc - nSteps * stepDeg) <= stepDeg * END_TOLERANCE;
    return { count: nSteps + 1 + (endIsRegular ? 0 : 1), nSteps, endIsRegular };
}

function assertSampleCount(fromDeg: number, toDeg: number, stepDeg: number): number {
    const { count } = planSlewAngles(fromDeg, toDeg, stepDeg);
    if (!(count <= MAX_SWEEP_SAMPLES)) {
        throw new RangeError(
            `sweepSlew: step ${stepDeg}° over ${fromDeg}° to ${toDeg}° needs ${count} samples, ` +
                `more than the limit of ${MAX_SWEEP_SAMPLES}. Use a larger step (BACKLOG M7 uses 2° to 5°).`,
        );
    }
    return count;
}

/**
 * Validates the sweep parameters before running any geometry.
 *
 * Rules:
 *  - stepDeg must be > 0 and finite, fromDeg and toDeg must be finite
 *  - The sweep must not need more than MAX_SWEEP_SAMPLES angles (exactly
 *    MAX_SWEEP_SAMPLES is allowed)
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
    assertAngleRange(fromDeg, toDeg, stepDeg);
    assertSampleCount(fromDeg, toDeg, stepDeg);
    // BoomPlacement validation (length, radius, elevation, pivot, etc.)
    // slewDeg is overwritten at each step, so validate it at fromDeg.
    validateBoomPlacement({ ...basePlacement, slewDeg: fromDeg });
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
 * `toDeg` is always the last angle, exactly, even for a very small sweep. A last
 * regular step within 1e-9 of a step of `toDeg` is replaced by `toDeg` (so
 * 0 to 0.3 in steps of 0.1 ends at 0.3, not 0.30000000000000004).
 *
 * @throws RangeError if `stepDeg` is not > 0 and finite, if an angle is not
 *   finite, or if more than MAX_SWEEP_SAMPLES angles would be needed. It checks
 *   this itself, before building the list, so it is safe to call directly.
 * @returns Array of slew angles in degrees, ordered from `fromDeg` to `toDeg`.
 */
export function generateSlewAngles(fromDeg: number, toDeg: number, stepDeg: number): number[] {
    assertAngleRange(fromDeg, toDeg, stepDeg);
    assertSampleCount(fromDeg, toDeg, stepDeg);
    if (fromDeg === toDeg) return [fromDeg];

    const direction = toDeg > fromDeg ? 1 : -1;
    const { nSteps, endIsRegular } = planSlewAngles(fromDeg, toDeg, stepDeg);

    const angles: number[] = [];
    for (let i = 0; i <= nSteps; i++) {
        angles.push(fromDeg + i * direction * stepDeg);
    }
    if (endIsRegular) {
        angles[angles.length - 1] = toDeg;
    } else {
        angles.push(toDeg);
    }
    return angles;
}

/**
 * The most any point of the boom can move when the slew turns from a sampled
 * angle to the angle halfway to the next sample (the worst case between two
 * samples).
 *
 * The slew turns the boom about the vertical line through its foot. Every point
 * of the boom cylinder is at most sqrt(L^2 + r^2) from the foot, and a point at
 * distance d from the turning line moves by 2 d sin(delta / 2) when the slew
 * turns by delta. Here delta is half of `maxGapDeg`: any angle between two
 * samples is within half a gap of the nearest one. The distance between two
 * solids changes by at most the distance the boom points move, so the real
 * clearance at any angle is at least (sampled clearance) - (this value).
 */
export function betweenSamplesAllowanceM(boom: BoomPlacement, maxGapDeg: number, footOffsetM = 0): number {
    // Farthest boom point from the slew axis: the foot offset plus the farthest point from the foot.
    const reachM = footOffsetM + Math.hypot(boom.boomLengthM, boom.boomRadiusM);
    const deltaRad = Math.min(((maxGapDeg / 2) * Math.PI) / 180, Math.PI);
    return 2 * reachM * Math.sin(deltaRad / 2);
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
 * closest angle can fall between two samples. So a SAFE result at the samples is
 * not enough: `sweepStatus` is SAFE only when the clearance is also proved between
 * the samples (`guaranteedMinDistanceM`, which subtracts
 * `betweenSamplesAllowanceM`). If the step is too coarse for that, `sweepStatus`
 * is WARNING (red), never SAFE. This matters most when `clearanceLimitM` is 0,
 * because then the WARNING zone is off and a sampled distance of a few
 * centimetres would otherwise read as SAFE. Example from the tests: a 20 m boom
 * tip reaching 1 cm past a wall at 180° is CRITICAL with a 1° step; a 5° step
 * samples 0.009 m from the wall, and `sweepStatus` is WARNING (not SAFE, even
 * with a limit of 0). Keep the step at 2° to 5° as the BACKLOG says, and use a
 * smaller step (up to MAX_SWEEP_SAMPLES samples) to prove a small gap.
 *
 * @param factory - WASM-backed ShapeFactory.
 * @param basePlacement - Boom placement template (slewDeg is overridden per step).
 * @param fromDeg - Pick slew angle in degrees.
 * @param toDeg - Set slew angle in degrees.
 * @param stepDeg - Slew increment in degrees (must be > 0).
 * @param buildings - Building footprints from the site model.
 * @param powerLine - Optional power-line obstacle.
 * @param footOffsetM - Distance (m, >= 0, default 0) of the boom foot from the slew axis in the slew
 *   direction. With 0 the pivot of `basePlacement` is on the slew axis and does not move. With an offset,
 *   `basePlacement.pivotM` is the slew axis point and the foot at each angle is that point plus the offset
 *   along the slew direction, like the crane's real boom foot.
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
    footOffsetM = 0,
): SwingSweepReport {
    validateSweepParams(basePlacement, fromDeg, toDeg, stepDeg);
    if (!Number.isFinite(footOffsetM) || footOffsetM < 0) {
        throw new RangeError(`sweepSlew: footOffsetM must be >= 0 and finite (got ${footOffsetM}).`);
    }

    const angles = generateSlewAngles(fromDeg, toDeg, stepDeg);
    const steps: SweepStep[] = [];

    // Status severity for comparison: lower number = more severe.
    const severity = (s: ObstacleClearanceResult["status"]) =>
        s === "CRITICAL" ? 0 : s === "WARNING" ? 1 : 2;

    let worstStep: SwingSweepReport["worstStep"] = null;
    let anyCollision = false;

    // The obstacles do not move, so build them once (not at every angle) and free them at the end.
    // The boom is built at each angle and freed inside checkPreparedObstacles.
    const obstacles = prepareObstacles(factory, buildings, powerLine);
    try {
        for (const angle of angles) {
            const rad = (angle * Math.PI) / 180;
            const placement: BoomPlacement = {
                ...basePlacement,
                pivotM: {
                    x: basePlacement.pivotM.x + footOffsetM * Math.cos(rad),
                    y: basePlacement.pivotM.y + footOffsetM * Math.sin(rad),
                    z: basePlacement.pivotM.z,
                },
                slewDeg: angle,
            };
            const report = checkPreparedObstacles(factory, placement, obstacles);

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
                        (newSev === currentSev &&
                            report.worstCase.minDistanceM < worstStep.result.minDistanceM)
                    ) {
                        worstStep = { slewDeg: angle, result: report.worstCase };
                    }
                }
            }
        }
    } finally {
        obstacles.dispose();
    }

    const maxAngleGapDeg = angles.reduce(
        (gap, angle, i) => (i === 0 ? gap : Math.max(gap, Math.abs(angle - angles[i - 1]))),
        0,
    );
    const allowanceM = betweenSamplesAllowanceM(basePlacement, maxAngleGapDeg, footOffsetM);
    const verdict = judgeWholeSwing(steps, anyCollision, allowanceM);

    return {
        fromDeg,
        toDeg,
        stepDeg,
        sampleCount: angles.length,
        steps,
        worstStep,
        anyCollision,
        maxAngleGapDeg,
        betweenSamplesAllowanceM: allowanceM,
        guaranteedMinDistanceM: verdict.guaranteedMinDistanceM,
        sweepStatus: verdict.status,
        sweepStatusNote: verdict.note,
        disclaimer: "Planning aid, not a certified lift plan.",
    };
}

/**
 * Turns the sampled results into one verdict for the whole swing, including the
 * angles between the samples (see `betweenSamplesAllowanceM`).
 */
function judgeWholeSwing(
    steps: SweepStep[],
    anyCollision: boolean,
    allowanceM: number,
): {
    status: SwingSweepReport["sweepStatus"];
    guaranteedMinDistanceM: number | null;
    note: string;
} {
    // Smallest sampled distance of each obstacle, with its own clearance limit.
    const perObstacle = new Map<
        string,
        { label: string; minM: number; limitM: number; sampledWarning: boolean }
    >();
    for (const step of steps) {
        for (const r of step.report.obstacles) {
            const prev = perObstacle.get(r.obstacleId);
            const sampledWarning = r.status !== "SAFE";
            if (!prev) {
                perObstacle.set(r.obstacleId, {
                    label: r.obstacleLabel,
                    minM: r.minDistanceM,
                    limitM: r.clearanceLimitM,
                    sampledWarning,
                });
            } else {
                prev.minM = Math.min(prev.minM, r.minDistanceM);
                prev.sampledWarning = prev.sampledWarning || sampledWarning;
            }
        }
    }

    if (perObstacle.size === 0) {
        return {
            status: null,
            guaranteedMinDistanceM: null,
            note: "No obstacles were checked, so no verdict. This is not SAFE.",
        };
    }

    let guaranteedMinDistanceM = Number.POSITIVE_INFINITY;
    let notProved: { label: string; lowerM: number; limitM: number; sampledWarning: boolean } | null = null;
    for (const o of perObstacle.values()) {
        const lowerM = o.minM - allowanceM;
        guaranteedMinDistanceM = Math.min(guaranteedMinDistanceM, lowerM);
        // Proved clear over the whole swing: at least the limit, and above 0.
        const proved = lowerM >= o.limitM && lowerM > 0;
        if (!proved && (!notProved || lowerM < notProved.lowerM)) {
            notProved = { label: o.label, lowerM, limitM: o.limitM, sampledWarning: o.sampledWarning };
        }
    }

    if (anyCollision) {
        return {
            status: "CRITICAL",
            guaranteedMinDistanceM,
            note: "A sampled angle collides with or touches an obstacle.",
        };
    }
    if (notProved) {
        const note = notProved.sampledWarning
            ? `${notProved.label} is closer than its clearance limit of ${notProved.limitM} m at a sampled angle.`
            : `Clear at every sampled angle, but with this step the swing between samples can come ${allowanceM.toFixed(3)} m closer, ` +
              `so ${notProved.label} is not proved clear (guaranteed distance ${notProved.lowerM.toFixed(3)} m, ` +
              `limit ${notProved.limitM} m). Use a smaller step.`;
        return { status: "WARNING", guaranteedMinDistanceM, note };
    }
    return {
        status: "SAFE",
        guaranteedMinDistanceM,
        note: "Every obstacle is clear by at least its limit at the samples and between them.",
    };
}
