// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { DEFAULT_VELOCITY_LIMITS, type VelocityLimits, validateVelocityLimits } from "./velocityLimits";

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
        const min = normalizeAngleDeg(slew.minAngleDeg);
        const max = normalizeAngleDeg(slew.maxAngleDeg);
        const rangeCrossesZero = min > max;

        if (rangeCrossesZero) {
            if (direction === "cw") {
                if (newAngle > max && newAngle < min) newAngle = max;
            } else {
                if (newAngle < min && newAngle > max) newAngle = min;
            }
        } else {
            newAngle = clamp(newAngle, min, max);
        }
    }

    return { ...slew, angleDeg: normalizeAngleDeg(newAngle) };
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
    const maxHookHeightM = craneConfig.mastHeightM - 1.5; // hook block height ~1.5m

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
