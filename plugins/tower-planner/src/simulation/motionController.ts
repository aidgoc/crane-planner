// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type CraneSimulationState,
    clamp,
    normalizeAngleDeg,
    type SimulationState,
    type SimulationStatus,
    updateHoist,
    updateSlew,
    updateTrolley,
    type VelocityLimits,
    validateSlewRestrictionSpan,
    validateVelocityLimits,
} from "./simulationState";

/**
 * Motion command types for the three crane motions.
 */
export type MotionCommand =
    | { readonly type: "hoist"; readonly direction: "up" | "down" }
    | { readonly type: "trolley"; readonly direction: "in" | "out" }
    | { readonly type: "slew"; readonly direction: "cw" | "ccw" }
    | { readonly type: "stop"; readonly motion: "hoist" | "trolley" | "slew" };

/**
 * Result of a simulation update step.
 */
export interface UpdateResult {
    readonly state: SimulationState;
    readonly changed: boolean;
}

/**
 * Configuration for the motion controller.
 */
export interface MotionControllerConfig {
    readonly maxTimeStepMs: number; // maximum allowed time step in ms
    readonly minTimeStepMs: number; // minimum time step for stability
}

/**
 * Default configuration for the motion controller.
 */
export const DEFAULT_MOTION_CONTROLLER_CONFIG: MotionControllerConfig = {
    maxTimeStepMs: 1000, // 1 second max step
    minTimeStepMs: 1, // 1 ms minimum step
};

/**
 * Validates that a time step is valid.
 */
function validateTimeStep(dtMs: number, config: MotionControllerConfig): string | null {
    if (!Number.isFinite(dtMs)) {
        return "Time step must be a finite number.";
    }
    if (dtMs < 0) {
        return "Time step must not be negative.";
    }
    if (dtMs > config.maxTimeStepMs) {
        return `Time step ${dtMs}ms exceeds maximum allowed ${config.maxTimeStepMs}ms.`;
    }
    if (dtMs < config.minTimeStepMs && dtMs > 0) {
        return `Time step ${dtMs}ms is below minimum ${config.minTimeStepMs}ms.`;
    }
    return null;
}

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
 * Creates a deep, independent clone of a CraneSimulationState.
 * This ensures the reset baseline never shares nested mutable objects with
 * live state or caller-provided objects.
 */
function cloneCraneSimulationState(state: CraneSimulationState): CraneSimulationState {
    return {
        hoist: { ...state.hoist },
        trolley: { ...state.trolley },
        slew: { ...state.slew },
        velocityLimits: { ...state.velocityLimits },
    };
}

/**
 * Main motion controller class.
 * Handles time-step based updates for hoist, trolley, and slew motions.
 */
export class MotionController {
    private state: SimulationState;
    private config: MotionControllerConfig;
    // Snapshot of the initial crane simulation state for reset()
    private initialCraneState: CraneSimulationState;

    constructor(initialState: CraneSimulationState, config?: Partial<MotionControllerConfig>) {
        const errors = validateVelocityLimits(initialState.velocityLimits);
        if (errors.length > 0) {
            throw new Error(`Invalid velocity limits: ${errors.join("; ")}`);
        }

        // Validate slew restriction span in initial state
        const slewSpanError = validateSlewRestrictionSpan(
            initialState.slew.minAngleDeg,
            initialState.slew.maxAngleDeg,
        );
        if (slewSpanError) {
            throw new Error(slewSpanError);
        }

        // Store a deep, independent snapshot of the constructor's initial state
        this.initialCraneState = cloneCraneSimulationState(initialState);
        this.state = {
            ...cloneCraneSimulationState(initialState),
            status: "idle",
            lastUpdateTimeMs: 0,
        };
        this.config = { ...DEFAULT_MOTION_CONTROLLER_CONFIG, ...config };
    }

    /**
     * Gets the current simulation state.
     */
    getState(): SimulationState {
        return { ...this.state };
    }

    /**
     * Gets the current control status.
     */
    getStatus(): SimulationStatus {
        return this.state.status;
    }

    /**
     * Starts the simulation.
     * Uses relative simulation time (0-based). If resuming from paused,
     * the accumulated time is preserved.
     */
    start(): void {
        if (this.state.status === "idle") {
            this.state = {
                ...this.state,
                status: "running",
                lastUpdateTimeMs: 0,
            };
        } else if (this.state.status === "paused") {
            this.state = {
                ...this.state,
                status: "running",
                // Preserve accumulated simulation time when resuming
            };
        }
    }

    /**
     * Pauses the simulation.
     * Preserves accumulated simulation time.
     */
    pause(): void {
        if (this.state.status === "running") {
            this.state = {
                ...this.state,
                status: "paused",
            };
        }
    }

    /**
     * Resumes the simulation from paused state.
     * Preserves accumulated simulation time.
     */
    resume(): void {
        if (this.state.status === "paused") {
            this.state = {
                ...this.state,
                status: "running",
            };
        }
    }

    /**
     * Resets the simulation to initial state.
     * Resets accumulated simulation time to 0.
     * Restores hoist, trolley, and slew to their initial positions.
     * If initialState is provided, it becomes the new reset baseline.
     */
    reset(initialState?: CraneSimulationState): void {
        if (initialState) {
            // Validate before changing anything
            const errors = validateVelocityLimits(initialState.velocityLimits);
            if (errors.length > 0) {
                throw new Error(`Invalid velocity limits: ${errors.join("; ")}`);
            }
            const slewSpanError = validateSlewRestrictionSpan(
                initialState.slew.minAngleDeg,
                initialState.slew.maxAngleDeg,
            );
            if (slewSpanError) {
                throw new Error(slewSpanError);
            }
            // Validation passed — now update baseline
            this.initialCraneState = cloneCraneSimulationState(initialState);
        }
        // Restore from the baseline using a fresh independent copy
        this.state = {
            ...cloneCraneSimulationState(this.initialCraneState),
            status: "idle",
            lastUpdateTimeMs: 0,
        };
    }

    /**
     * Applies a motion command for a given time step.
     * This is the primary way to drive the simulation.
     */
    applyCommand(command: MotionCommand, dtMs: number): UpdateResult {
        const validationError = validateTimeStep(dtMs, this.config);
        if (validationError) {
            throw new Error(validationError);
        }

        if (this.state.status !== "running" || dtMs <= 0) {
            return { state: this.getState(), changed: false };
        }

        const dtSeconds = dtMs / 1000;
        let changed = false;
        let newHoist = this.state.hoist;
        let newTrolley = this.state.trolley;
        let newSlew = this.state.slew;

        switch (command.type) {
            case "hoist": {
                const updated = updateHoist(
                    this.state.hoist,
                    command.direction,
                    this.state.velocityLimits.hoist,
                    dtSeconds,
                );
                if (updated.heightM !== this.state.hoist.heightM) {
                    newHoist = updated;
                    changed = true;
                }
                break;
            }
            case "trolley": {
                const updated = updateTrolley(
                    this.state.trolley,
                    command.direction,
                    this.state.velocityLimits.trolley,
                    dtSeconds,
                );
                if (updated.radiusM !== this.state.trolley.radiusM) {
                    newTrolley = updated;
                    changed = true;
                }
                break;
            }
            case "slew": {
                const updated = updateSlew(
                    this.state.slew,
                    command.direction,
                    this.state.velocityLimits.slew,
                    dtSeconds,
                );
                if (updated.angleDeg !== this.state.slew.angleDeg) {
                    newSlew = updated;
                    changed = true;
                }
                break;
            }
            case "stop": {
                // Stop just means no motion is applied for this motion type
                // The simulation continues running but this motion is not updated
                break;
            }
        }

        const newState: SimulationState = {
            ...this.state,
            hoist: newHoist,
            trolley: newTrolley,
            slew: newSlew,
            lastUpdateTimeMs: this.state.lastUpdateTimeMs + dtMs,
        };

        this.state = newState;
        return { state: this.getState(), changed };
    }

    /**
     * Applies multiple commands simultaneously for a time step.
     * Useful for coordinated motions (e.g., slew + trolley movement).
     */
    applyCommands(commands: MotionCommand[], dtMs: number): UpdateResult {
        const validationError = validateTimeStep(dtMs, this.config);
        if (validationError) {
            throw new Error(validationError);
        }

        if (this.state.status !== "running" || dtMs <= 0 || commands.length === 0) {
            return { state: this.getState(), changed: false };
        }

        const dtSeconds = dtMs / 1000;
        let changed = false;
        let newHoist = this.state.hoist;
        let newTrolley = this.state.trolley;
        let newSlew = this.state.slew;

        for (const command of commands) {
            switch (command.type) {
                case "hoist": {
                    const updated = updateHoist(
                        newHoist,
                        command.direction,
                        this.state.velocityLimits.hoist,
                        dtSeconds,
                    );
                    if (updated.heightM !== newHoist.heightM) changed = true;
                    newHoist = updated;
                    break;
                }
                case "trolley": {
                    const updated = updateTrolley(
                        newTrolley,
                        command.direction,
                        this.state.velocityLimits.trolley,
                        dtSeconds,
                    );
                    if (updated.radiusM !== newTrolley.radiusM) changed = true;
                    newTrolley = updated;
                    break;
                }
                case "slew": {
                    const updated = updateSlew(
                        newSlew,
                        command.direction,
                        this.state.velocityLimits.slew,
                        dtSeconds,
                    );
                    if (updated.angleDeg !== newSlew.angleDeg) changed = true;
                    newSlew = updated;
                    break;
                }
                case "stop":
                    // No motion for this type
                    break;
            }
        }

        const newState: SimulationState = {
            ...this.state,
            hoist: newHoist,
            trolley: newTrolley,
            slew: newSlew,
            lastUpdateTimeMs: this.state.lastUpdateTimeMs + dtMs,
        };

        this.state = newState;
        return { state: this.getState(), changed };
    }

    /**
     * Sets a new hoist position directly (e.g., for initialization or reset).
     */
    setHoistHeight(heightM: number): void {
        const clamped = clamp(heightM, this.state.hoist.minHeightM, this.state.hoist.maxHeightM);
        this.state = { ...this.state, hoist: { ...this.state.hoist, heightM: clamped } };
    }

    /**
     * Sets a new trolley radius directly.
     */
    setTrolleyRadius(radiusM: number): void {
        const clamped = clamp(radiusM, this.state.trolley.minRadiusM, this.state.trolley.maxRadiusM);
        this.state = { ...this.state, trolley: { ...this.state.trolley, radiusM: clamped } };
    }

    /**
     * Sets a new slew angle directly.
     * Applies angle restrictions if configured. If the angle falls within
     * a restricted (forbidden) sector, it is clamped to the nearest boundary
     * using circular distance.
     */
    setSlewAngle(angleDeg: number): void {
        const normalized = normalizeAngleDeg(angleDeg);
        // Apply restrictions if configured
        let finalAngle = normalized;
        if (this.state.slew.minAngleDeg !== undefined && this.state.slew.maxAngleDeg !== undefined) {
            // Validate span using shared validation
            const spanError = validateSlewRestrictionSpan(
                this.state.slew.minAngleDeg,
                this.state.slew.maxAngleDeg,
            );
            if (spanError) {
                throw new Error(spanError);
            }

            const min = normalizeAngleDeg(this.state.slew.minAngleDeg);
            const max = normalizeAngleDeg(this.state.slew.maxAngleDeg);

            // Check for full-circle configuration (exactly 360° span)
            // This must be checked BEFORE checking rangeCrossesZero, because
            // normalizing both 0° and 360° gives 0°, which would look like a zero-width sector.
            const rawMin = this.state.slew.minAngleDeg;
            const rawMax = this.state.slew.maxAngleDeg;
            const span = Math.abs(rawMax - rawMin);
            const isFullCircle = span === 360;

            if (isFullCircle) {
                // Full rotation allowed — no restriction
                finalAngle = normalized;
            } else {
                const rangeCrossesZero = min > max;

                if (rangeCrossesZero) {
                    // Range crosses 0° (e.g., 300° to 60°).
                    // Allowed: [min, 360) U [0, max]. Forbidden: (max, min).
                    // If normalized is in forbidden range, clamp to nearest boundary.
                    if (normalized > max && normalized < min) {
                        // Inside forbidden range — clamp to nearest boundary using circular distance
                        finalAngle = nearestBoundary(normalized, min, max);
                    }
                } else {
                    // Normal range (min < max, doesn't cross 0).
                    // Allowed: [min, max]. Forbidden: outside this range.
                    // Use circular distance to find nearest boundary.
                    if (normalized < min || normalized > max) {
                        finalAngle = nearestBoundary(normalized, min, max);
                    }
                }
            }
        }
        this.state = { ...this.state, slew: { ...this.state.slew, angleDeg: finalAngle } };
    }

    /**
     * Updates velocity limits.
     */
    setVelocityLimits(limits: VelocityLimits): void {
        const errors = validateVelocityLimits(limits);
        if (errors.length > 0) {
            throw new Error(`Invalid velocity limits: ${errors.join("; ")}`);
        }
        this.state = { ...this.state, velocityLimits: limits };
    }
}

export { clamp, normalizeAngleDeg, updateHoist, updateSlew, updateTrolley } from "./simulationState";
export { DEFAULT_VELOCITY_LIMITS, validateVelocityLimits } from "./velocityLimits";
