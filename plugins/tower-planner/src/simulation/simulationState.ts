// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { DEFAULT_VELOCITY_LIMITS, type VelocityLimits } from "./velocityLimits";

/**
 * Calculates the shortest angular distance from angle `from` to angle `to` on a circle.
 * Returns positive if `to` is counter-clockwise from `from`, negative if clockwise.
 * Both angles must be normalized to [0, 360).
 */
function angularDistance(from: number, to: number): number {
    const diff = (to - from + 360) % 360;
    return diff > 180 ? diff - 360 : diff;
}

/**
 * Finds the nearest boundary of an allowed angular sector to a given angle.
 * Returns the boundary angle (min or max) that is closest in circular distance.
 * For equal distances, returns the min boundary (deterministic tie-breaking).
 */
function nearestBoundary(angle: number, min: number, max: number): number {
    const distToMin = Math.abs(angularDistance(angle, min));
    const distToMax = Math.abs(angularDistance(angle, max));
    return distToMin <= distToMax ? min : max;
}

/**
 * Validates a slew angle restriction span.
 * - Exactly 360° is valid and unrestricted.
 * - Less than 360° is valid (restricted sector).
 * - Greater than 360° is invalid.
 * Returns an error message string if invalid, null if valid.
 */
export function validateSlewRestrictionSpan(
    minAngleDeg: number | undefined,
    maxAngleDeg: number | undefined,
): string | null {
    if (minAngleDeg === undefined || maxAngleDeg === undefined) {
        return null; // No restriction configured
    }
    const span = Math.abs(maxAngleDeg - minAngleDeg);
    if (span > 360) {
        return `Invalid slew angle restriction: span of ${span}° exceeds maximum 360°. Provided range: [${minAngleDeg}°, ${maxAngleDeg}°]. Use exactly 360° for unrestricted rotation (e.g., [0, 360] or [90, 450]).`;
    }
    return null;
}

/**
 * Clamps a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Re-export VelocityLimits for convenience.
 */
export type { VelocityLimits } from "./velocityLimits";
export { DEFAULT_VELOCITY_LIMITS, validateVelocityLimits } from "./velocityLimits";

/**
 * Hoist position state.
 * Height in metres from crane base (ground level).
 */
export interface HoistState {
    readonly heightM: number;
    readonly minHeightM: number;
    readonly maxHeightM: number;
}

/**
 * Trolley position state.
 * Radius in metres from mast center along the jib.
 */
export interface TrolleyState {
    readonly radiusM: number;
    readonly minRadiusM: number;
    readonly maxRadiusM: number;
}

/**
 * Slew position state.
 * Angle in degrees, normalized to [0, 360).
 */
export interface SlewState {
    readonly angleDeg: number;
    readonly minAngleDeg?: number;
    readonly maxAngleDeg?: number;
}

/**
 * Complete crane simulation state.
 */
export interface CraneSimulationState {
    readonly hoist: HoistState;
    readonly trolley: TrolleyState;
    readonly slew: SlewState;
    readonly velocityLimits: VelocityLimits;
}

/**
 * Simulation control state.
 */
export type SimulationStatus = "idle" | "running" | "paused";

/**
 * Full simulation state including control status.
 */
export interface SimulationState extends CraneSimulationState {
    readonly status: SimulationStatus;
    readonly lastUpdateTimeMs: number;
}

/**
 * Creates default hoist state for MCT 88.
 * minHeightM: hook at ground level (0m)
 * maxHeightM: hook at mast tip height (mastHeightM - hookHeightM)
 */
export function createHoistState(
    minHeightM: number,
    maxHeightM: number,
    initialHeightM?: number,
): HoistState {
    return {
        minHeightM,
        maxHeightM,
        heightM: initialHeightM ?? minHeightM,
    };
}

/**
 * Creates default trolley state.
 * minRadiusM: minimum hook radius from catalogue
 * maxRadiusM: jib length (maximum trolley position)
 */
export function createTrolleyState(
    minRadiusM: number,
    maxRadiusM: number,
    initialRadiusM?: number,
): TrolleyState {
    return {
        minRadiusM,
        maxRadiusM,
        radiusM: initialRadiusM ?? minRadiusM,
    };
}

/**
 * Creates default slew state.
 * Angle in degrees, normalized to [0, 360).
 * Optional min/max angle for slew restrictions.
 */
export function createSlewState(
    initialAngleDeg: number,
    minAngleDeg?: number,
    maxAngleDeg?: number,
): SlewState {
    const normalized = normalizeAngleDeg(initialAngleDeg);
    return {
        angleDeg: normalized,
        minAngleDeg: minAngleDeg ?? undefined,
        maxAngleDeg: maxAngleDeg ?? undefined,
    };
}

/**
 * Normalizes angle to [0, 360) degrees.
 */
export function normalizeAngleDeg(angleDeg: number): number {
    const normalized = angleDeg % 360;
    const result = normalized < 0 ? normalized + 360 : normalized;
    // Handle -0 case
    return result === 0 ? 0 : result;
}

/**
 * Updates hoist position based on direction and elapsed time.
 */
export function updateHoist(
    hoist: HoistState,
    direction: "up" | "down",
    velocityLimit: number,
    dtSeconds: number,
): HoistState {
    const delta = velocityLimit * dtSeconds;
    const newHeight = direction === "up" ? hoist.heightM + delta : hoist.heightM - delta;
    const clampedHeight = clamp(newHeight, hoist.minHeightM, hoist.maxHeightM);
    return { ...hoist, heightM: clampedHeight };
}

/**
 * Updates trolley position based on direction and elapsed time.
 */
export function updateTrolley(
    trolley: TrolleyState,
    direction: "in" | "out",
    velocityLimit: number,
    dtSeconds: number,
): TrolleyState {
    const delta = velocityLimit * dtSeconds;
    const newRadius = direction === "in" ? trolley.radiusM - delta : trolley.radiusM + delta;
    const clampedRadius = clamp(newRadius, trolley.minRadiusM, trolley.maxRadiusM);
    return { ...trolley, radiusM: clampedRadius };
}

/**
 * Updates slew angle based on direction and elapsed time.
 * Handles angular wraparound and optional angle restrictions.
 * For cross-zero ranges, the candidate angle is normalized before checking.
 * For normal ranges, the raw angle is clamped before normalization to prevent
 * wrapping through the forbidden zone.
 * Full-circle configurations (360° span) are treated as unrestricted.
 */
export function updateSlew(
    slew: SlewState,
    direction: "cw" | "ccw",
    velocityLimit: number,
    dtSeconds: number,
): SlewState {
    const delta = velocityLimit * dtSeconds;
    let newAngle = direction === "cw" ? slew.angleDeg + delta : slew.angleDeg - delta;

    if (slew.minAngleDeg !== undefined && slew.maxAngleDeg !== undefined) {
        // Validate span first using shared validation
        const spanError = validateSlewRestrictionSpan(slew.minAngleDeg, slew.maxAngleDeg);
        if (spanError) {
            throw new Error(spanError);
        }

        // Check for full-circle configuration BEFORE normalizing endpoints
        // 0° to 360° (or equivalent) normalizes to min=0, max=0, which would
        // incorrectly appear as a zero-width forbidden sector.
        const rawMin = slew.minAngleDeg;
        const rawMax = slew.maxAngleDeg;
        const span = Math.abs(rawMax - rawMin);
        const isFullCircle = span === 360;

        if (isFullCircle) {
            // Full rotation allowed — just normalize
            newAngle = normalizeAngleDeg(newAngle);
        } else {
            const min = normalizeAngleDeg(rawMin);
            const max = normalizeAngleDeg(rawMax);
            const rangeCrossesZero = min > max;

            if (rangeCrossesZero) {
                // Range crosses 0° (e.g., 300° to 60°).
                // Allowed: [min, 360) U [0, max]. Forbidden: (max, min).
                // Normalize first, then check if in forbidden range.
                newAngle = normalizeAngleDeg(newAngle);
                if (newAngle > max && newAngle < min) {
                    // Inside forbidden range — clamp to nearest boundary
                    // Distance to max boundary (going backward): (newAngle - max + 360) % 360
                    // Distance to min boundary (going forward): (min - newAngle + 360) % 360
                    newAngle = nearestBoundary(newAngle, min, max);
                }
            } else {
                // Normal range (min < max, doesn't cross 0).
                // Allowed: [min, max]. Clamp raw angle before normalization
                // to prevent wrapping through forbidden zone.
                newAngle = clamp(newAngle, min, max);
                newAngle = normalizeAngleDeg(newAngle);
            }
        }
    } else {
        // No restrictions - just normalize
        newAngle = normalizeAngleDeg(newAngle);
    }

    return { ...slew, angleDeg: newAngle };
}

/**
 * Creates the complete default crane simulation state for MCT 88.
 */
export function createDefaultCraneSimulationState(
    craneConfig: {
        mastHeightM: number;
        jibLengthM: number;
        minHookRadiusM: number;
        initialSlewAngleDeg?: number;
    },
    velocityLimits?: VelocityLimits,
): CraneSimulationState {
    // INDICATIVE: Hook block height deduction of 1.5 m is an assumption.
    // Real values must be sourced from manufacturer documentation for each crane model.
    const hookBlockHeightM = 1.5; // INDICATIVE
    const maxHookHeightM = craneConfig.mastHeightM - hookBlockHeightM;

    return {
        hoist: createHoistState(0, maxHookHeightM, maxHookHeightM), // start at max height
        trolley: createTrolleyState(
            craneConfig.minHookRadiusM,
            craneConfig.jibLengthM,
            craneConfig.jibLengthM,
        ),
        slew: createSlewState(craneConfig.initialSlewAngleDeg ?? 0),
        velocityLimits: velocityLimits ?? DEFAULT_VELOCITY_LIMITS,
    };
}
