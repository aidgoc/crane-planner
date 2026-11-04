// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type CraneSimulationState,
    type HoistState,
    normalizeAngleDeg,
    type SimulationState,
    type SimulationStatus,
    type SlewState,
    type TrolleyState,
    type VelocityLimits,
} from "./simulationState";
import { DEFAULT_VELOCITY_LIMITS, validateVelocityLimits } from "./velocityLimits";

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
 * Clamps a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Updates hoist position based on direction and elapsed time.
 */
function updateHoist(
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
function updateTrolley(
    trolley: TrolleyState,
    direction: "in" | "out",
    velocityLimit: number,
    dtSeconds: number,
): TrolleyState {
    const delta = velocityLimit * dtSeconds;
    // "in" means moving toward mast (decreasing radius), "out" means away (increasing radius)
    const newRadius = direction === "in" ? trolley.radiusM - delta : trolley.radiusM + delta;
    const clampedRadius = clamp(newRadius, trolley.minRadiusM, trolley.maxRadiusM);
    return { ...trolley, radiusM: clampedRadius };
}

/**
 * Updates slew angle based on direction and elapsed time.
 * Handles angular wraparound and optional angle restrictions.
 */
function updateSlew(
    slew: SlewState,
    direction: "cw" | "ccw",
    velocityLimit: number,
    dtSeconds: number,
): SlewState {
    const delta = velocityLimit * dtSeconds;
    let newAngle = direction === "cw" ? slew.angleDeg + delta : slew.angleDeg - delta;

    // Apply angle restrictions if configured
    if (slew.minAngleDeg !== undefined && slew.maxAngleDeg !== undefined) {
        // Handle restricted range (e.g., 30° to 150°)
        const min = normalizeAngleDeg(slew.minAngleDeg);
        const max = normalizeAngleDeg(slew.maxAngleDeg);

        // Check if the range crosses 0°
        const rangeCrossesZero = min > max;

        if (rangeCrossesZero) {
            // Range is e.g., 300° to 60° (crosses 0)
            if (direction === "cw") {
                // Moving CW from max toward min
                if (newAngle > max && newAngle < min) {
                    newAngle = max;
                }
            } else {
                // Moving CCW from min toward max
                if (newAngle < min && newAngle > max) {
                    newAngle = min;
                }
            }
        } else {
            // Normal range (min < max, doesn't cross 0)
            newAngle = clamp(newAngle, min, max);
        }
    }

    return { ...slew, angleDeg: normalizeAngleDeg(newAngle) };
}

/**
 * Main motion controller class.
 * Handles time-step based updates for hoist, trolley, and slew motions.
 */
export class MotionController {
    private state: SimulationState;
    private config: MotionControllerConfig;

    constructor(initialState: CraneSimulationState, config?: Partial<MotionControllerConfig>) {
        const errors = validateVelocityLimits(initialState.velocityLimits);
        if (errors.length > 0) {
            throw new Error(`Invalid velocity limits: ${errors.join("; ")}`);
        }

        this.state = {
            ...initialState,
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
     */
    start(): void {
        if (this.state.status === "idle" || this.state.status === "paused") {
            this.state = {
                ...this.state,
                status: "running",
                lastUpdateTimeMs: Date.now(),
            };
        }
    }

    /**
     * Pauses the simulation.
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
     */
    resume(): void {
        if (this.state.status === "paused") {
            this.state = {
                ...this.state,
                status: "running",
                lastUpdateTimeMs: Date.now(),
            };
        }
    }

    /**
     * Resets the simulation to initial state.
     */
    reset(initialState?: CraneSimulationState): void {
        if (initialState) {
            const errors = validateVelocityLimits(initialState.velocityLimits);
            if (errors.length > 0) {
                throw new Error(`Invalid velocity limits: ${errors.join("; ")}`);
            }
            this.state = {
                ...initialState,
                status: "idle",
                lastUpdateTimeMs: 0,
            };
        } else {
            this.state = {
                ...this.state,
                status: "idle",
                lastUpdateTimeMs: 0,
            };
        }
    }

    /**
     * Updates the simulation by a time step.
     * Returns the new state and whether any position changed.
     */
    update(dtMs: number): UpdateResult {
        const validationError = validateTimeStep(dtMs, this.config);
        if (validationError) {
            throw new Error(validationError);
        }

        if (this.state.status !== "running" || dtMs <= 0) {
            return { state: this.getState(), changed: false };
        }

        const dtSeconds = dtMs / 1000;
        const changed = false;
        const newHoist = this.state.hoist;
        const newTrolley = this.state.trolley;
        const newSlew = this.state.slew;

        // The actual motion commands are applied externally via applyCommand
        // This update() just advances time for currently active motions
        // In a real implementation, active commands would be tracked

        // For now, this is a placeholder - actual motion is driven by applyCommand
        // which applies the motion for the given time step

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
     */
    setSlewAngle(angleDeg: number): void {
        const normalized = normalizeAngleDeg(angleDeg);
        // Apply restrictions if configured
        let finalAngle = normalized;
        if (this.state.slew.minAngleDeg !== undefined && this.state.slew.maxAngleDeg !== undefined) {
            const min = normalizeAngleDeg(this.state.slew.minAngleDeg);
            const max = normalizeAngleDeg(this.state.slew.maxAngleDeg);
            const rangeCrossesZero = min > max;

            if (rangeCrossesZero) {
                if (!(normalized >= max && normalized <= min)) {
                    // Outside restricted range, clamp to nearest boundary
                    const distToMin = (normalized - min + 360) % 360;
                    const distToMax = (max - normalized + 360) % 360;
                    finalAngle = distToMin < distToMax ? min : max;
                }
            } else {
                finalAngle = clamp(normalized, min, max);
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
