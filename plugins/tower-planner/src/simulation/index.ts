// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root.

export type {
    MotionCommand,
    MotionControllerConfig,
    UpdateResult,
} from "./motionController";
export {
    DEFAULT_MOTION_CONTROLLER_CONFIG,
    MotionController,
} from "./motionController";
export type {
    CraneSimulationState,
    HoistState,
    SimulationState,
    SimulationStatus,
    SlewState,
    TrolleyState,
    VelocityLimits,
} from "./simulationState";
export {
    clamp,
    createDefaultCraneSimulationState,
    createHoistState,
    createSlewState,
    createTrolleyState,
    DEFAULT_VELOCITY_LIMITS,
    normalizeAngleDeg,
    updateHoist,
    updateSlew,
    updateTrolley,
    validateVelocityLimits,
} from "./simulationState";
