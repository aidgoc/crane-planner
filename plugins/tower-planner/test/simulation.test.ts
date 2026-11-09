// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import {
    DEFAULT_VELOCITY_LIMITS,
    MotionController,
    updateHoist,
    updateSlew,
    updateTrolley,
} from "../src/simulation/motionController";
import {
    type CraneSimulationState,
    clamp,
    createDefaultCraneSimulationState,
    createHoistState,
    createSlewState,
    createTrolleyState,
    type HoistState,
    normalizeAngleDeg,
    type SlewState,
    type TrolleyState,
} from "../src/simulation/simulationState";
import { type VelocityLimits, validateVelocityLimits } from "../src/simulation/velocityLimits";

/*
 * HAND CALCULATIONS FOR TESTS:
 *
 * Hoist: velocity 0.8 m/s, dt = 1s → delta = 0.8 m
 *   Start at 10m, up 1s → 10.8m; down 1s → 9.2m
 *
 * Trolley: velocity 0.5 m/s, dt = 1s → delta = 0.5 m
 *   Start at 20m, in 1s → 19.5m; out 1s → 20.5m
 *
 * Slew: velocity 0.6 deg/s, dt = 1s → delta = 0.6°
 *   Start at 10°, cw 1s → 10.6°; ccw 1s → 9.4°
 *
 * Boundary tests:
 *   Hoist: min 0, max 38.5 (mastHeightM - hookHeightM). At 38m, up 1s → 38.8m → clamped to 38.5
 *   Trolley: min 16.2, max 30 (jibLengthM). At 29.8m, out 1s → 30.3m → clamped to 30
 *   Slew: at 359°, cw 1s (0.6°) → 359.6°; at 1°, ccw 1s → 0.4°
 */

describe("VelocityLimits", () => {
    describe("DEFAULT_VELOCITY_LIMITS", () => {
        test("has positive finite values for all motions", () => {
            expect(DEFAULT_VELOCITY_LIMITS.hoist).toBeGreaterThan(0);
            expect(DEFAULT_VELOCITY_LIMITS.trolley).toBeGreaterThan(0);
            expect(DEFAULT_VELOCITY_LIMITS.slew).toBeGreaterThan(0);
            expect(Number.isFinite(DEFAULT_VELOCITY_LIMITS.hoist)).toBe(true);
            expect(Number.isFinite(DEFAULT_VELOCITY_LIMITS.trolley)).toBe(true);
            expect(Number.isFinite(DEFAULT_VELOCITY_LIMITS.slew)).toBe(true);
        });
    });

    describe("validateVelocityLimits", () => {
        test("passes for valid limits", () => {
            const limits: VelocityLimits = { hoist: 1, trolley: 1, slew: 1 };
            expect(validateVelocityLimits(limits)).toEqual([]);
        });

        test("fails for non-positive hoist", () => {
            const limits: VelocityLimits = { hoist: 0, trolley: 1, slew: 1 };
            const errors = validateVelocityLimits(limits);
            expect(errors.length).toBe(1);
            expect(errors[0]).toContain("Hoist");
        });

        test("fails for non-positive trolley", () => {
            const limits: VelocityLimits = { hoist: 1, trolley: -0.5, slew: 1 };
            const errors = validateVelocityLimits(limits);
            expect(errors.length).toBe(1);
            expect(errors[0]).toContain("Trolley");
        });

        test("fails for non-positive slew", () => {
            const limits: VelocityLimits = { hoist: 1, trolley: 1, slew: NaN };
            const errors = validateVelocityLimits(limits);
            expect(errors.length).toBe(1);
            expect(errors[0]).toContain("Slew");
        });

        test("fails for multiple invalid limits", () => {
            const limits: VelocityLimits = { hoist: 0, trolley: -1, slew: 0 };
            const errors = validateVelocityLimits(limits);
            expect(errors.length).toBe(3);
        });
    });
});

describe("SimulationState helpers", () => {
    describe("normalizeAngleDeg", () => {
        test("normalizes positive angles", () => {
            expect(normalizeAngleDeg(0)).toBe(0);
            expect(normalizeAngleDeg(90)).toBe(90);
            expect(normalizeAngleDeg(360)).toBe(0);
            expect(normalizeAngleDeg(450)).toBe(90);
            expect(normalizeAngleDeg(720)).toBe(0);
        });

        test("normalizes negative angles", () => {
            expect(normalizeAngleDeg(-90)).toBe(270);
            expect(normalizeAngleDeg(-180)).toBe(180);
            expect(normalizeAngleDeg(-360)).toBe(0);
            expect(normalizeAngleDeg(-450)).toBe(270);
        });

        test("handles large angles", () => {
            expect(normalizeAngleDeg(1080)).toBe(0);
            expect(normalizeAngleDeg(-1080)).toBe(0);
        });
    });

    describe("createHoistState", () => {
        test("creates state with given bounds and default initial at min", () => {
            const state = createHoistState(0, 40);
            expect(state.minHeightM).toBe(0);
            expect(state.maxHeightM).toBe(40);
            expect(state.heightM).toBe(0);
        });

        test("creates state with custom initial height", () => {
            const state = createHoistState(0, 40, 20);
            expect(state.heightM).toBe(20);
        });
    });

    describe("createTrolleyState", () => {
        test("creates state with given bounds and default initial at min", () => {
            const state = createTrolleyState(16.2, 52);
            expect(state.minRadiusM).toBe(16.2);
            expect(state.maxRadiusM).toBe(52);
            expect(state.radiusM).toBe(16.2);
        });

        test("creates state with custom initial radius", () => {
            const state = createTrolleyState(16.2, 52, 30);
            expect(state.radiusM).toBe(30);
        });
    });

    describe("createSlewState", () => {
        test("creates state with normalized angle", () => {
            const state = createSlewState(450);
            expect(state.angleDeg).toBe(90);
        });

        test("creates state with negative angle", () => {
            const state = createSlewState(-90);
            expect(state.angleDeg).toBe(270);
        });

        test("includes optional min/max angle", () => {
            const state = createSlewState(45, 0, 180);
            expect(state.minAngleDeg).toBe(0);
            expect(state.maxAngleDeg).toBe(180);
        });
    });

    describe("createDefaultCraneSimulationState", () => {
        test("creates complete state for MCT 88 config", () => {
            const state = createDefaultCraneSimulationState({
                mastHeightM: 40,
                jibLengthM: 30,
                minHookRadiusM: 16.2,
                initialSlewAngleDeg: 0,
            });

            expect(state.hoist.minHeightM).toBe(0);
            expect(state.hoist.maxHeightM).toBe(38.5); // 40 - 1.5
            expect(state.hoist.heightM).toBe(38.5);

            expect(state.trolley.minRadiusM).toBe(16.2);
            expect(state.trolley.maxRadiusM).toBe(30);
            expect(state.trolley.radiusM).toBe(30);

            expect(state.slew.angleDeg).toBe(0);
            expect(state.velocityLimits).toEqual(DEFAULT_VELOCITY_LIMITS);
        });

        test("allows custom velocity limits", () => {
            const customLimits: VelocityLimits = { hoist: 1, trolley: 1, slew: 1 };
            const state = createDefaultCraneSimulationState(
                { mastHeightM: 40, jibLengthM: 30, minHookRadiusM: 16.2 },
                customLimits,
            );
            expect(state.velocityLimits).toEqual(customLimits);
        });
    });
});

describe("Utility functions", () => {
    describe("clamp", () => {
        test("clamps below min", () => {
            expect(clamp(-5, 0, 10)).toBe(0);
        });

        test("clamps above max", () => {
            expect(clamp(15, 0, 10)).toBe(10);
        });

        test("returns value within range", () => {
            expect(clamp(5, 0, 10)).toBe(5);
        });

        test("handles edge cases", () => {
            expect(clamp(0, 0, 10)).toBe(0);
            expect(clamp(10, 0, 10)).toBe(10);
        });
    });

    describe("normalizeAngleDeg", () => {
        test("same as standalone function", () => {
            expect(normalizeAngleDeg(450)).toBe(90);
            expect(normalizeAngleDeg(-90)).toBe(270);
        });
    });
});

describe("Motion updates (pure functions)", () => {
    describe("updateHoist", () => {
        const baseHoist: HoistState = { minHeightM: 0, maxHeightM: 40, heightM: 20 };
        const velocity = 0.8; // m/s

        test("moves up by velocity * dt", () => {
            const result = updateHoist(baseHoist, "up", velocity, 1);
            expect(result.heightM).toBeCloseTo(20.8);
        });

        test("moves down by velocity * dt", () => {
            const result = updateHoist(baseHoist, "down", velocity, 1);
            expect(result.heightM).toBeCloseTo(19.2);
        });

        test("clamps at max height", () => {
            const nearTop: HoistState = { minHeightM: 0, maxHeightM: 40, heightM: 39.5 };
            const result = updateHoist(nearTop, "up", 1, 1);
            expect(result.heightM).toBe(40);
        });

        test("clamps at min height", () => {
            const nearBottom: HoistState = { minHeightM: 0, maxHeightM: 40, heightM: 0.5 };
            const result = updateHoist(nearBottom, "down", 1, 1);
            expect(result.heightM).toBe(0);
        });

        test("scales with dt", () => {
            const result = updateHoist(baseHoist, "up", 0.8, 0.5); // 0.5 seconds
            expect(result.heightM).toBeCloseTo(20.4);
        });
    });

    describe("updateTrolley", () => {
        const baseTrolley: TrolleyState = { minRadiusM: 16.2, maxRadiusM: 52, radiusM: 30 };
        const velocity = 0.5; // m/s

        test("moves in (toward mast) by velocity * dt", () => {
            const result = updateTrolley(baseTrolley, "in", velocity, 1);
            expect(result.radiusM).toBeCloseTo(29.5);
        });

        test("moves out (away from mast) by velocity * dt", () => {
            const result = updateTrolley(baseTrolley, "out", velocity, 1);
            expect(result.radiusM).toBeCloseTo(30.5);
        });

        test("clamps at min radius", () => {
            const nearMin: TrolleyState = { minRadiusM: 16.2, maxRadiusM: 52, radiusM: 16.5 };
            const result = updateTrolley(nearMin, "in", 1, 1);
            expect(result.radiusM).toBe(16.2);
        });

        test("clamps at max radius", () => {
            const nearMax: TrolleyState = { minRadiusM: 16.2, maxRadiusM: 52, radiusM: 51.5 };
            const result = updateTrolley(nearMax, "out", 1, 1);
            expect(result.radiusM).toBe(52);
        });

        test("scales with dt", () => {
            const result = updateTrolley(baseTrolley, "out", 0.5, 0.5);
            expect(result.radiusM).toBeCloseTo(30.25);
        });
    });

    describe("updateSlew", () => {
        const velocity = 0.6; // deg/s

        test("moves cw (increasing angle)", () => {
            const slew: SlewState = { angleDeg: 10 };
            const result = updateSlew(slew, "cw", velocity, 1);
            expect(result.angleDeg).toBeCloseTo(10.6);
        });

        test("moves ccw (decreasing angle)", () => {
            const slew: SlewState = { angleDeg: 10 };
            const result = updateSlew(slew, "ccw", velocity, 1);
            expect(result.angleDeg).toBeCloseTo(9.4);
        });

        test("wraps around at 360° (cw)", () => {
            const slew: SlewState = { angleDeg: 359 };
            const result = updateSlew(slew, "cw", 2, 1);
            expect(result.angleDeg).toBeCloseTo(1);
        });

        test("wraps around at 0° (ccw)", () => {
            const slew: SlewState = { angleDeg: 1 };
            const result = updateSlew(slew, "ccw", 2, 1);
            expect(result.angleDeg).toBeCloseTo(359);
        });

        test("respects min/max angle restrictions (normal range)", () => {
            const slew: SlewState = { angleDeg: 50, minAngleDeg: 0, maxAngleDeg: 90 };
            const result = updateSlew(slew, "cw", 50, 1);
            expect(result.angleDeg).toBe(90);
        });

        test("clamps at min angle (normal range)", () => {
            const slew: SlewState = { angleDeg: 10, minAngleDeg: 0, maxAngleDeg: 90 };
            const result = updateSlew(slew, "ccw", 20, 1);
            expect(result.angleDeg).toBe(0);
        });

        test("handles range crossing 0° (e.g., 300° to 60°)", () => {
            // Range: 300° to 60° (crosses 0)
            const slew: SlewState = { angleDeg: 30, minAngleDeg: 300, maxAngleDeg: 60 };

            // CW from 30 should go toward 60 (max)
            const resultCw = updateSlew(slew, "cw", 40, 1);
            expect(resultCw.angleDeg).toBe(60);

            // CCW from 30 by 40°: 30 - 40 = -10 = 350° (valid in [300, 360) range)
            const resultCcw = updateSlew(slew, "ccw", 40, 1);
            expect(resultCcw.angleDeg).toBeCloseTo(350);
        });
    });
});

describe("MotionController", () => {
    const defaultState = createDefaultCraneSimulationState({
        mastHeightM: 40,
        jibLengthM: 30,
        minHookRadiusM: 16.2,
        initialSlewAngleDeg: 0,
    });

    const createController = (state = defaultState) => new MotionController(state);

    describe("constructor", () => {
        test("creates controller with valid state", () => {
            const controller = createController();
            expect(controller.getStatus()).toBe("idle");
            expect(controller.getState().hoist.heightM).toBeCloseTo(38.5);
        });

        test("throws on invalid velocity limits", () => {
            const badState = { ...defaultState, velocityLimits: { hoist: 0, trolley: 1, slew: 1 } };
            expect(() => new MotionController(badState)).toThrow(/Hoist velocity limit/);
        });
    });

    describe("status controls", () => {
        test("start changes status to running", () => {
            const controller = createController();
            controller.start();
            expect(controller.getStatus()).toBe("running");
        });

        test("pause changes status to paused", () => {
            const controller = createController();
            controller.start();
            controller.pause();
            expect(controller.getStatus()).toBe("paused");
        });

        test("resume changes status back to running", () => {
            const controller = createController();
            controller.start();
            controller.pause();
            controller.resume();
            expect(controller.getStatus()).toBe("running");
        });

        test("reset restores idle status", () => {
            const controller = createController();
            controller.start();
            controller.reset();
            expect(controller.getStatus()).toBe("idle");
        });

        test("repeated start does not change status", () => {
            const controller = createController();
            controller.start();
            controller.start();
            expect(controller.getStatus()).toBe("running");
        });

        test("pause when idle does nothing", () => {
            const controller = createController();
            controller.pause();
            expect(controller.getStatus()).toBe("idle");
        });

        test("resume when not paused does nothing", () => {
            const controller = createController();
            controller.resume();
            expect(controller.getStatus()).toBe("idle");
        });
    });

    describe("applyCommand - hoist", () => {
        test("hoist up moves hook up", () => {
            const controller = createController({
                ...defaultState,
                hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 20 },
            });
            controller.start();
            const initialHeight = controller.getState().hoist.heightM;
            const result = controller.applyCommand({ type: "hoist", direction: "up" }, 500); // 0.5s
            expect(result.changed).toBe(true);
            expect(controller.getState().hoist.heightM).toBeCloseTo(initialHeight + 0.4);
        });

        test("hoist up clamps at max height", () => {
            const controller = createController({
                ...defaultState,
                hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 38.0 },
            });
            controller.start();
            const result = controller.applyCommand({ type: "hoist", direction: "up" }, 1000); // 1s
            expect(result.changed).toBe(true);
            expect(controller.getState().hoist.heightM).toBeCloseTo(38.5, 1);
        });

        test("hoist down clamps at min height", () => {
            const controller = createController({
                ...defaultState,
                hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 0.5 },
            });
            controller.start();
            const result = controller.applyCommand({ type: "hoist", direction: "down" }, 1000);
            expect(result.changed).toBe(true);
            expect(controller.getState().hoist.heightM).toBeCloseTo(0, 1);
        });
    });

    describe("applyCommand - trolley", () => {
        test("trolley in moves toward mast", () => {
            const controller = createController({
                ...defaultState,
                trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 20 },
            });
            controller.start();
            const initialRadius = controller.getState().trolley.radiusM;
            const result = controller.applyCommand({ type: "trolley", direction: "in" }, 500);
            expect(result.changed).toBe(true);
            expect(controller.getState().trolley.radiusM).toBeCloseTo(initialRadius - 0.25);
        });

        test("trolley out moves away from mast", () => {
            const controller = createController({
                ...defaultState,
                trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 20 },
            });
            controller.start();
            const initialRadius = controller.getState().trolley.radiusM;
            const result = controller.applyCommand({ type: "trolley", direction: "out" }, 500);
            expect(result.changed).toBe(true);
            expect(controller.getState().trolley.radiusM).toBeCloseTo(initialRadius + 0.25);
        });

        test("trolley in clamps at min radius", () => {
            const controller = createController({
                ...defaultState,
                trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 16.5 },
            });
            controller.start();
            const result = controller.applyCommand({ type: "trolley", direction: "in" }, 1000); // 1s
            expect(result.changed).toBe(true);
            expect(controller.getState().trolley.radiusM).toBeCloseTo(16.2, 1);
        });

        test("trolley out clamps at max radius", () => {
            const controller = createController({
                ...defaultState,
                trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 29.5 },
            });
            controller.start();
            const result = controller.applyCommand({ type: "trolley", direction: "out" }, 1000); // 1s
            expect(result.changed).toBe(true);
            expect(controller.getState().trolley.radiusM).toBeCloseTo(30, 1);
        });
    });

    describe("applyCommand - slew", () => {
        test("slew cw increases angle", () => {
            const controller = createController({
                ...defaultState,
                slew: { angleDeg: 10 },
            });
            controller.start();
            const initialAngle = controller.getState().slew.angleDeg;
            const result = controller.applyCommand({ type: "slew", direction: "cw" }, 500);
            expect(result.changed).toBe(true);
            expect(controller.getState().slew.angleDeg).toBeCloseTo(initialAngle + 0.3);
        });

        test("slew ccw decreases angle", () => {
            const controller = createController({
                ...defaultState,
                slew: { angleDeg: 10 },
            });
            controller.start();
            const initialAngle = controller.getState().slew.angleDeg;
            const result = controller.applyCommand({ type: "slew", direction: "ccw" }, 500);
            expect(result.changed).toBe(true);
            expect(controller.getState().slew.angleDeg).toBeCloseTo(initialAngle - 0.3);
        });

        test("slew cw wraps at 360°", () => {
            const controller = createController({
                ...defaultState,
                slew: { angleDeg: 359.5 },
            });
            controller.start();
            const result = controller.applyCommand({ type: "slew", direction: "cw" }, 500);
            expect(result.changed).toBe(true);
            expect(controller.getState().slew.angleDeg).toBeCloseTo(359.8);
        });

        test("slew ccw wraps at 0°", () => {
            const controller = createController({
                ...defaultState,
                slew: { angleDeg: 0.5 },
            });
            controller.start();
            const result = controller.applyCommand({ type: "slew", direction: "ccw" }, 500);
            expect(result.changed).toBe(true);
            expect(controller.getState().slew.angleDeg).toBeCloseTo(0.2);
        });

        test("slew respects angle restrictions", () => {
            const controller = createController({
                ...defaultState,
                slew: { angleDeg: 45, minAngleDeg: 0, maxAngleDeg: 90 },
            });
            controller.start();
            controller.applyCommand({ type: "slew", direction: "cw" }, 500); // 0.3°
            expect(controller.getState().slew.angleDeg).toBeCloseTo(45.3);

            // Move to boundary with two 1000ms steps to reach clamp
            controller.setSlewAngle(89);
            controller.applyCommand({ type: "slew", direction: "cw" }, 1000); // 1s * 0.6 = 0.6°
            controller.applyCommand({ type: "slew", direction: "cw" }, 1000); // another 0.6°
            expect(controller.getState().slew.angleDeg).toBe(90); // clamped
        });
    });

    describe("applyCommands (multiple simultaneous)", () => {
        test("applies hoist and trolley simultaneously", () => {
            const controller = createController({
                ...defaultState,
                hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 20 },
                trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 20 },
            });
            controller.start();
            const initial = controller.getState();
            const result = controller.applyCommands(
                [
                    { type: "hoist", direction: "up" },
                    { type: "trolley", direction: "out" },
                ],
                500,
            );
            expect(result.changed).toBe(true);
            expect(controller.getState().hoist.heightM).toBeCloseTo(initial.hoist.heightM + 0.4);
            expect(controller.getState().trolley.radiusM).toBeCloseTo(initial.trolley.radiusM + 0.25);
        });

        test("applies all three motions simultaneously", () => {
            const controller = createController({
                ...defaultState,
                hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 20 },
                trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 20 },
                slew: { angleDeg: 10 },
            });
            controller.start();
            const initial = controller.getState();
            const result = controller.applyCommands(
                [
                    { type: "hoist", direction: "up" },
                    { type: "trolley", direction: "out" },
                    { type: "slew", direction: "cw" },
                ],
                500,
            );
            expect(result.changed).toBe(true);
            expect(controller.getState().hoist.heightM).toBeCloseTo(initial.hoist.heightM + 0.4);
            expect(controller.getState().trolley.radiusM).toBeCloseTo(initial.trolley.radiusM + 0.25);
            expect(controller.getState().slew.angleDeg).toBeCloseTo(initial.slew.angleDeg + 0.3);
        });
    });

    describe("direct setters", () => {
        test("setHoistHeight clamps to bounds", () => {
            const controller = createController();
            controller.setHoistHeight(50);
            expect(controller.getState().hoist.heightM).toBe(38.5);
            controller.setHoistHeight(-10);
            expect(controller.getState().hoist.heightM).toBe(0);
            controller.setHoistHeight(20);
            expect(controller.getState().hoist.heightM).toBe(20);
        });

        test("setTrolleyRadius clamps to bounds", () => {
            const controller = createController();
            controller.setTrolleyRadius(50);
            expect(controller.getState().trolley.radiusM).toBe(30);
            controller.setTrolleyRadius(10);
            expect(controller.getState().trolley.radiusM).toBe(16.2);
            controller.setTrolleyRadius(25);
            expect(controller.getState().trolley.radiusM).toBe(25);
        });

        test("setSlewAngle normalizes and clamps", () => {
            const controller = createController();
            controller.setSlewAngle(450);
            expect(controller.getState().slew.angleDeg).toBe(90);
            controller.setSlewAngle(-90);
            expect(controller.getState().slew.angleDeg).toBe(270);

            // With restrictions
            controller.reset({
                ...defaultState,
                slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 90 },
            });
            controller.setSlewAngle(-10);
            // Circular distance: 350° to 0° = 10°, 350° to 90° = 100° → nearest is 0°
            expect(controller.getState().slew.angleDeg).toBe(0);
            controller.setSlewAngle(100);
            expect(controller.getState().slew.angleDeg).toBe(90);
        });
    });

    describe("velocity limits", () => {
        test("setVelocityLimits updates limits", () => {
            const controller = createController();
            controller.setVelocityLimits({ hoist: 2, trolley: 1, slew: 1 });
            expect(controller.getState().velocityLimits.hoist).toBe(2);
        });

        test("setVelocityLimits validates", () => {
            const controller = createController();
            expect(() => controller.setVelocityLimits({ hoist: 0, trolley: 1, slew: 1 })).toThrow();
        });
    });

    describe("time step handling", () => {
        test("applyCommand with dt=0 returns unchanged", () => {
            const controller = createController();
            controller.start();
            const result = controller.applyCommand({ type: "hoist", direction: "up" }, 0);
            expect(result.changed).toBe(false);
        });

        test("applyCommand while paused returns unchanged", () => {
            const controller = createController();
            controller.start();
            controller.pause();
            const result = controller.applyCommand({ type: "hoist", direction: "up" }, 500);
            expect(result.changed).toBe(false);
        });

        test("applyCommand while idle returns unchanged", () => {
            const controller = createController();
            const result = controller.applyCommand({ type: "hoist", direction: "up" }, 500);
            expect(result.changed).toBe(false);
        });

        test("applyCommand with stop command returns unchanged", () => {
            const controller = createController();
            controller.start();
            const result = controller.applyCommand({ type: "stop", motion: "hoist" }, 500);
            expect(result.changed).toBe(false);
        });

        test("applyCommand with negative dt throws", () => {
            const controller = createController();
            controller.start();
            expect(() => controller.applyCommand({ type: "hoist", direction: "up" }, -100)).toThrow();
        });

        test("applyCommand with excessive dt throws", () => {
            const controller = createController();
            controller.start();
            // Default max is 1000ms
            expect(() => controller.applyCommand({ type: "hoist", direction: "up" }, 1500)).toThrow();
        });
    });

    describe("simulation time convention", () => {
        test("start from idle sets lastUpdateTimeMs to 0", () => {
            const controller = createController();
            controller.start();
            expect(controller.getState().lastUpdateTimeMs).toBe(0);
        });

        test("start from paused preserves accumulated time", () => {
            const controller = createController();
            controller.start();
            controller.applyCommand({ type: "hoist", direction: "up" }, 500);
            const timeAfterFirstCommand = controller.getState().lastUpdateTimeMs;
            controller.pause();
            controller.start();
            expect(controller.getState().lastUpdateTimeMs).toBe(timeAfterFirstCommand);
        });

        test("applyCommand accumulates relative simulation time", () => {
            const controller = createController();
            controller.start();
            controller.applyCommand({ type: "hoist", direction: "up" }, 500);
            expect(controller.getState().lastUpdateTimeMs).toBe(500);
            controller.applyCommand({ type: "trolley", direction: "out" }, 300);
            expect(controller.getState().lastUpdateTimeMs).toBe(800);
        });

        test("reset resets simulation time to 0", () => {
            const controller = createController();
            controller.start();
            controller.applyCommand({ type: "hoist", direction: "up" }, 500);
            controller.reset();
            expect(controller.getState().lastUpdateTimeMs).toBe(0);
        });

        test("reset with new state resets simulation time to 0", () => {
            const controller = createController();
            controller.start();
            controller.applyCommand({ type: "hoist", direction: "up" }, 500);
            const newState = createDefaultCraneSimulationState({
                mastHeightM: 30,
                jibLengthM: 20,
                minHookRadiusM: 10,
            });
            controller.reset(newState);
            expect(controller.getState().lastUpdateTimeMs).toBe(0);
        });
    });

    describe("reset", () => {
        test("reset restores initial state", () => {
            const controller = createController();
            controller.start();
            controller.applyCommand({ type: "hoist", direction: "up" }, 500);
            controller.reset();
            expect(controller.getStatus()).toBe("idle");
            expect(controller.getState().hoist.heightM).toBeCloseTo(38.5);
        });

        test("reset with new state uses new state", () => {
            const controller = createController();
            const newState = createDefaultCraneSimulationState({
                mastHeightM: 30,
                jibLengthM: 20,
                minHookRadiusM: 10,
            });
            controller.reset(newState);
            expect(controller.getState().hoist.maxHeightM).toBeCloseTo(28.5);
            expect(controller.getState().trolley.maxRadiusM).toBe(20);
        });
    });
});

describe("T5 Acceptance Test: Trolley 10m to 30m", () => {
    /*
     * ACCEPTANCE TEST FROM BACKLOG:
     * "Trolley from 10 m to 30 m at a stated limit takes distance / speed seconds (hand-computed), test passes"
     *
     * HAND CALCULATION:
     * Distance = 30 - 10 = 20 m
     * Velocity limit = 0.5 m/s (DEFAULT_VELOCITY_LIMITS.trolley)
     * Time = Distance / Velocity = 20 / 0.5 = 40 seconds
     */
    test("trolley moves from 10m to 30m at 0.5 m/s takes 40 seconds", () => {
        const state = createDefaultCraneSimulationState({
            mastHeightM: 40,
            jibLengthM: 30,
            minHookRadiusM: 10, // Changed from 16.2 to 10 for this test
            initialSlewAngleDeg: 0,
        });

        // Override trolley min to 10m for this test
        const testState: CraneSimulationState = {
            ...state,
            trolley: { minRadiusM: 10, maxRadiusM: 30, radiusM: 10 },
        };

        const controller = new MotionController(testState);
        controller.start();

        // Simulate 40 seconds in 1-second steps
        const dtMs = 500;
        const totalSteps = 80; // 80 steps of 0.5s = 40 seconds
        let lastRadius = 10;

        for (let i = 0; i < totalSteps; i++) {
            controller.applyCommand({ type: "trolley", direction: "out" }, dtMs);
            lastRadius = controller.getState().trolley.radiusM;
        }

        // After 40 seconds at 0.5 m/s, should reach 30m (10 + 0.5 * 40 = 30)
        expect(lastRadius).toBeCloseTo(30, 1);

        // Verify exact time calculation: distance / speed = 20 / 0.5 = 40s
        // At 80 steps of 0.5s each = 40 seconds
        expect(lastRadius).toBe(30); // clamped exactly at max
    });

    test("trolley movement time is distance / velocity", () => {
        const velocity = 0.5; // m/s
        const startRadius = 15;
        const targetRadius = 25;
        const distance = targetRadius - startRadius; // 10 m
        const expectedTimeSeconds = distance / velocity; // 10 / 0.5 = 20 s

        const state = createDefaultCraneSimulationState({
            mastHeightM: 40,
            jibLengthM: 30,
            minHookRadiusM: 16.2,
        });
        const testState: CraneSimulationState = {
            ...state,
            trolley: { minRadiusM: 10, maxRadiusM: 30, radiusM: startRadius },
        };

        const controller = new MotionController(testState);
        controller.start();

        const dtMs = 500;
        const steps = expectedTimeSeconds * 2; // 0.5s steps
        for (let i = 0; i < steps; i++) {
            controller.applyCommand({ type: "trolley", direction: "out" }, dtMs);
        }

        expect(controller.getState().trolley.radiusM).toBeCloseTo(targetRadius, 1);
    });
});

describe("Edge cases and validation", () => {
    test("non-finite velocity limits rejected", () => {
        const badLimits = { hoist: NaN, trolley: 1, slew: 1 };
        expect(validateVelocityLimits(badLimits).length).toBeGreaterThan(0);

        const badLimits2 = { hoist: Infinity, trolley: 1, slew: 1 };
        expect(validateVelocityLimits(badLimits2).length).toBeGreaterThan(0);
    });

    test("zero and negative velocity limits rejected", () => {
        expect(validateVelocityLimits({ hoist: 0, trolley: 1, slew: 1 }).length).toBe(1);
        expect(validateVelocityLimits({ hoist: -1, trolley: 1, slew: 1 }).length).toBe(1);
    });

    test("angle normalization handles edge cases", () => {
        expect(normalizeAngleDeg(360)).toBe(0);
        expect(normalizeAngleDeg(-360)).toBe(0);
        expect(normalizeAngleDeg(720)).toBe(0);
        expect(normalizeAngleDeg(-720)).toBe(0);
    });

    test("clamp handles edge cases", () => {
        expect(clamp(5, 5, 10)).toBe(5);
        expect(clamp(10, 5, 10)).toBe(10);
        expect(clamp(5, 5, 5)).toBe(5);
    });

    test("controller rejects invalid commands gracefully", () => {
        const state = createDefaultCraneSimulationState({
            mastHeightM: 40,
            jibLengthM: 30,
            minHookRadiusM: 16.2,
            initialSlewAngleDeg: 0,
        });
        const controller = new MotionController(state);
        controller.start();
        // stop command doesn't move anything
        const result = controller.applyCommand({ type: "stop", motion: "hoist" }, 500);
        expect(result.changed).toBe(false);
    });
});

describe("Slew restriction fixes", () => {
    const baseState = createDefaultCraneSimulationState({
        mastHeightM: 40,
        jibLengthM: 30,
        minHookRadiusM: 16.2,
        initialSlewAngleDeg: 0,
    });
    const createCtrl = (state = baseState) => new MotionController(state);

    describe("updateSlew cross-zero boundary handling", () => {
        test("359° + 2° CW wraps to 1° and is allowed in cross-zero sector", () => {
            // Restricted sector: 350° to 10° (crosses 0°)
            // Allowed: [350, 360) U [0, 10]. Forbidden: (10, 350).
            const slew: SlewState = { angleDeg: 359, minAngleDeg: 350, maxAngleDeg: 10 };
            const result = updateSlew(slew, "cw", 2, 1); // 359 + 2 = 361 → 1°
            // 1° is in allowed range [0, 10] → should NOT clamp
            expect(result.angleDeg).toBe(1);
        });

        test("1° - 2° CCW wraps to 359° and is allowed in cross-zero sector", () => {
            // Restricted sector: 350° to 10° (crosses 0°)
            // Allowed: [350, 360) U [0, 10]. Forbidden: (10, 350).
            const slew: SlewState = { angleDeg: 1, minAngleDeg: 350, maxAngleDeg: 10 };
            const result = updateSlew(slew, "ccw", 2, 1); // 1 - 2 = -1 → 359°
            // 359° is in allowed range [350, 360) → should NOT clamp
            expect(result.angleDeg).toBe(359);
        });

        test("movement from allowed to forbidden cross-zero sector is clamped", () => {
            // Restricted sector: 300° to 60° (crosses 0°)
            // Allowed: [300, 360) U [0, 60]. Forbidden: (60, 300).
            const slew: SlewState = { angleDeg: 50, minAngleDeg: 300, maxAngleDeg: 60 };
            // Move CW by 20°: 50 + 20 = 70° (inside forbidden)
            const result = updateSlew(slew, "cw", 20, 1);
            // 70° is in forbidden (60, 300). Distance to 60 = 10, to 300 = 230 → clamp to 60
            expect(result.angleDeg).toBe(60);
        });

        test("movement within allowed cross-zero sector stays allowed", () => {
            // Restricted sector: 300° to 60° (crosses 0°)
            // Start at 350° (allowed), move CCW by 40°: 350 - 40 = 310° (allowed)
            const slew: SlewState = { angleDeg: 350, minAngleDeg: 300, maxAngleDeg: 60 };
            const result = updateSlew(slew, "ccw", 40, 1);
            expect(result.angleDeg).toBe(310); // stays in allowed range
        });

        test("normal non-wrapping restricted sector still works CW", () => {
            // Restricted sector: 30° to 150° (doesn't cross 0°)
            const slew: SlewState = { angleDeg: 50, minAngleDeg: 30, maxAngleDeg: 150 };
            const result = updateSlew(slew, "cw", 150, 1); // 50 + 150 = 200 → clamped to 150
            expect(result.angleDeg).toBe(150);
        });

        test("normal non-wrapping restricted sector CCW clamp", () => {
            const slew: SlewState = { angleDeg: 100, minAngleDeg: 30, maxAngleDeg: 150 };
            const result = updateSlew(slew, "ccw", 100, 1); // 100 - 100 = 0 → clamped to 30
            expect(result.angleDeg).toBe(30);
        });
    });

    describe("setSlewAngle cross-zero boundary handling", () => {
        test("setSlewAngle clamps angle inside forbidden cross-zero sector", () => {
            const controller = createCtrl({
                ...baseState,
                slew: { angleDeg: 0, minAngleDeg: 300, maxAngleDeg: 60 },
            });
            // 70° is inside forbidden range (60, 300) → should clamp to nearest (60)
            controller.setSlewAngle(70);
            expect(controller.getState().slew.angleDeg).toBe(60);
        });

        test("setSlewAngle allows angle in allowed cross-zero sector (high side)", () => {
            const controller = createCtrl({
                ...baseState,
                slew: { angleDeg: 0, minAngleDeg: 300, maxAngleDeg: 60 },
            });
            // 350° is in allowed range [300, 360) → should stay 350
            controller.setSlewAngle(350);
            expect(controller.getState().slew.angleDeg).toBe(350);
        });

        test("setSlewAngle allows angle in allowed cross-zero sector (low side)", () => {
            const controller = createCtrl({
                ...baseState,
                slew: { angleDeg: 0, minAngleDeg: 300, maxAngleDeg: 60 },
            });
            // 30° is in allowed range [0, 60] → should stay 30
            controller.setSlewAngle(30);
            expect(controller.getState().slew.angleDeg).toBe(30);
        });

        test("setSlewAngle clamps angle inside forbidden normal sector", () => {
            const controller = createCtrl({
                ...baseState,
                slew: { angleDeg: 0, minAngleDeg: 30, maxAngleDeg: 150 },
            });
            // 10° is inside forbidden range (outside [30, 150]) → should clamp to 30
            controller.setSlewAngle(10);
            expect(controller.getState().slew.angleDeg).toBe(30);
        });

        test("setSlewAngle allows angle in allowed normal sector", () => {
            const controller = createCtrl({
                ...baseState,
                slew: { angleDeg: 0, minAngleDeg: 30, maxAngleDeg: 150 },
            });
            // 90° is in allowed range [30, 150] → should stay 90
            controller.setSlewAngle(90);
            expect(controller.getState().slew.angleDeg).toBe(90);
        });
    });
});

describe("Issue 1: MotionController.reset() restores initial positions", () => {
    const baseState = createDefaultCraneSimulationState({
        mastHeightM: 40,
        jibLengthM: 30,
        minHookRadiusM: 16.2,
        initialSlewAngleDeg: 0,
    });
    const createCtrl = (state = baseState) => new MotionController(state);

    test("reset() without arguments restores hoist, trolley, and slew to initial positions", () => {
        const customState = createDefaultCraneSimulationState({
            mastHeightM: 40,
            jibLengthM: 30,
            minHookRadiusM: 16.2,
            initialSlewAngleDeg: 45,
        });
        // Override initial positions
        const testState: CraneSimulationState = {
            ...customState,
            hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 20 },
            trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 25 },
            slew: { angleDeg: 45 },
        };

        const controller = new MotionController(testState);
        controller.start();

        // Move all three axes
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);
        controller.applyCommand({ type: "trolley", direction: "out" }, 1000);
        controller.applyCommand({ type: "slew", direction: "cw" }, 1000);

        const movedState = controller.getState();
        expect(movedState.hoist.heightM).not.toBeCloseTo(20);
        expect(movedState.trolley.radiusM).not.toBeCloseTo(25);
        expect(movedState.slew.angleDeg).not.toBeCloseTo(45);

        // Reset should restore all positions
        controller.reset();
        const resetState = controller.getState();
        expect(resetState.hoist.heightM).toBeCloseTo(20);
        expect(resetState.trolley.radiusM).toBeCloseTo(25);
        expect(resetState.slew.angleDeg).toBeCloseTo(45);
        expect(resetState.status).toBe("idle");
        expect(resetState.lastUpdateTimeMs).toBe(0);
    });

    test("reset() with new state uses new state as baseline for subsequent resets", () => {
        const controller = new MotionController(
            createDefaultCraneSimulationState({
                mastHeightM: 40,
                jibLengthM: 30,
                minHookRadiusM: 16.2,
                initialSlewAngleDeg: 0,
            }),
        );
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);

        const newState = createDefaultCraneSimulationState({
            mastHeightM: 30,
            jibLengthM: 20,
            minHookRadiusM: 10,
            initialSlewAngleDeg: 90,
        });
        // Override initial positions in newState
        const testNewState: CraneSimulationState = {
            ...newState,
            hoist: { minHeightM: 0, maxHeightM: 28.5, heightM: 15 },
            trolley: { minRadiusM: 10, maxRadiusM: 20, radiusM: 15 },
            slew: { angleDeg: 90 },
        };

        controller.reset(testNewState);
        const afterFirstReset = controller.getState();
        expect(afterFirstReset.hoist.heightM).toBeCloseTo(15);
        expect(afterFirstReset.trolley.radiusM).toBeCloseTo(15);
        expect(afterFirstReset.slew.angleDeg).toBeCloseTo(90);

        // Move again
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);
        controller.applyCommand({ type: "trolley", direction: "out" }, 1000);
        controller.applyCommand({ type: "slew", direction: "cw" }, 1000);

        // Reset again without arguments should restore to testNewState
        controller.reset();
        const afterSecondReset = controller.getState();
        expect(afterSecondReset.hoist.heightM).toBeCloseTo(15);
        expect(afterSecondReset.trolley.radiusM).toBeCloseTo(15);
        expect(afterSecondReset.slew.angleDeg).toBeCloseTo(90);
    });

    test("repeated reset() calls are idempotent", () => {
        const controller = createCtrl({
            ...baseState,
            hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 10 },
            trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 20 },
            slew: { angleDeg: 30 },
        });
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);

        controller.reset();
        const firstReset = controller.getState();
        controller.reset();
        const secondReset = controller.getState();
        controller.reset();
        const thirdReset = controller.getState();

        expect(secondReset.hoist.heightM).toBeCloseTo(firstReset.hoist.heightM);
        expect(thirdReset.hoist.heightM).toBeCloseTo(firstReset.hoist.heightM);
        expect(secondReset.trolley.radiusM).toBeCloseTo(firstReset.trolley.radiusM);
        expect(thirdReset.trolley.radiusM).toBeCloseTo(firstReset.trolley.radiusM);
        expect(secondReset.slew.angleDeg).toBeCloseTo(firstReset.slew.angleDeg);
        expect(thirdReset.slew.angleDeg).toBeCloseTo(firstReset.slew.angleDeg);
    });
});

describe("Issue 2: setSlewAngle() uses circular distance for normal ranges", () => {
    const baseState = createDefaultCraneSimulationState({
        mastHeightM: 40,
        jibLengthM: 30,
        minHookRadiusM: 16.2,
        initialSlewAngleDeg: 0,
    });
    const createCtrl = (state = baseState) => new MotionController(state);

    test("[0°, 90°] sector: input -10° (350°) clamps to 0° (nearest boundary)", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 90 },
        });
        controller.setSlewAngle(-10); // normalizes to 350°
        // Circular distance: 350° to 0° = 10°, 350° to 90° = 100° → nearest is 0°
        expect(controller.getState().slew.angleDeg).toBe(0);
    });

    test("[0°, 90°] sector: input 350° clamps to 0°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 90 },
        });
        controller.setSlewAngle(350);
        expect(controller.getState().slew.angleDeg).toBe(0);
    });

    test("[0°, 90°] sector: input 100° clamps to 90°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 90 },
        });
        controller.setSlewAngle(100);
        expect(controller.getState().slew.angleDeg).toBe(90);
    });

    test("[0°, 90°] sector: input 45° stays 45° (inside allowed)", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 90 },
        });
        controller.setSlewAngle(45);
        expect(controller.getState().slew.angleDeg).toBe(45);
    });

    test("[45°, 135°] sector: input 30° clamps to 45°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 90, minAngleDeg: 45, maxAngleDeg: 135 },
        });
        controller.setSlewAngle(30);
        expect(controller.getState().slew.angleDeg).toBe(45);
    });

    test("[45°, 135°] sector: input 150° clamps to 135°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 90, minAngleDeg: 45, maxAngleDeg: 135 },
        });
        controller.setSlewAngle(150);
        expect(controller.getState().slew.angleDeg).toBe(135);
    });

    test("cross-zero sector [300°, 60°]: input 70° (forbidden) clamps to 60°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 300, maxAngleDeg: 60 },
        });
        controller.setSlewAngle(70);
        // 70° is in forbidden (60, 300). Circular distance to 60 = 10°, to 300 = 130° → 60°
        expect(controller.getState().slew.angleDeg).toBe(60);
    });

    test("cross-zero sector [300°, 60°]: input 200° (forbidden) clamps to 300°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 300, maxAngleDeg: 60 },
        });
        controller.setSlewAngle(200);
        // 200° is in forbidden (60, 300). Circular distance to 300 = 100°, to 60 = 140° → 300°
        expect(controller.getState().slew.angleDeg).toBe(300);
    });

    test("equal-distance case: input exactly midway between boundaries", () => {
        // Sector [0°, 180°], input 90° is exactly in middle
        // But 90° is inside allowed, so should stay
        const controller1 = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 180 },
        });
        controller1.setSlewAngle(90);
        expect(controller1.getState().slew.angleDeg).toBe(90);

        // Sector [0°, 90°], input 135°: distance to 0 = 135°, to 90 = 45° → 90°
        const controller2 = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 90 },
        });
        controller2.setSlewAngle(135);
        expect(controller2.getState().slew.angleDeg).toBe(90);
    });
});

describe("Issue 3: 0°–360° full rotation does not freeze at 0°", () => {
    const baseState = createDefaultCraneSimulationState({
        mastHeightM: 40,
        jibLengthM: 30,
        minHookRadiusM: 16.2,
        initialSlewAngleDeg: 0,
    });
    const createCtrl = (state = baseState) => new MotionController(state);

    test("full circle [0°, 360°] permits unrestricted CW motion through 0°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 359, minAngleDeg: 0, maxAngleDeg: 360 },
        });
        controller.start();
        // Move CW by 1.2°: 359 + 0.6*2 = 360.2 → normalizes to 0.2°
        // Use 4 steps of 500ms: 4 * 0.6 * 0.5 = 1.2°
        for (let i = 0; i < 4; i++) {
            controller.applyCommand({ type: "slew", direction: "cw" }, 500);
        }
        expect(controller.getState().slew.angleDeg).toBeCloseTo(0.2);
    });

    test("full circle [0°, 360°] permits unrestricted CCW motion through 0°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 1, minAngleDeg: 0, maxAngleDeg: 360 },
        });
        controller.start();
        // Move CCW by 1.2°: 1 - 0.6*2 = -0.2 → normalizes to 359.8°
        for (let i = 0; i < 4; i++) {
            controller.applyCommand({ type: "slew", direction: "ccw" }, 500);
        }
        expect(controller.getState().slew.angleDeg).toBeCloseTo(359.8);
    });

    test("full circle [0°, 360°] permits setting arbitrary angles", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 360 },
        });
        controller.setSlewAngle(180);
        expect(controller.getState().slew.angleDeg).toBe(180);
        controller.setSlewAngle(270);
        expect(controller.getState().slew.angleDeg).toBe(270);
        controller.setSlewAngle(350);
        expect(controller.getState().slew.angleDeg).toBe(350);
        controller.setSlewAngle(360); // normalizes to 0
        expect(controller.getState().slew.angleDeg).toBe(0);
    });

    test("full circle [0°, 360°] does not clamp valid motion to 0°", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 10, minAngleDeg: 0, maxAngleDeg: 360 },
        });
        controller.start();
        // Multiple steps CW
        for (let i = 0; i < 10; i++) {
            controller.applyCommand({ type: "slew", direction: "cw" }, 500);
        }
        // Should have moved CW, not frozen at 0
        expect(controller.getState().slew.angleDeg).toBeGreaterThan(10);
    });

    test("equivalent full-circle [90°, 450°] works the same", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 100, minAngleDeg: 90, maxAngleDeg: 450 },
        });
        controller.start();
        // 4 steps of 500ms = 1.2°
        for (let i = 0; i < 4; i++) {
            controller.applyCommand({ type: "slew", direction: "cw" }, 500);
        }
        expect(controller.getState().slew.angleDeg).toBeGreaterThan(100);
    });

    test("partial sector [0°, 90°] still restricts correctly", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 45, minAngleDeg: 0, maxAngleDeg: 90 },
        });
        controller.start();
        // Try to move CW past 90° using multiple steps
        // 45° to 90° = 45° needed. At 0.6 deg/s, 45/0.6 = 75s = 150 steps of 500ms
        for (let i = 0; i < 150; i++) {
            controller.applyCommand({ type: "slew", direction: "cw" }, 500);
        }
        expect(controller.getState().slew.angleDeg).toBeCloseTo(90); // clamped at max
    });

    test("cross-zero sector [300°, 60°] still restricts correctly", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 350, minAngleDeg: 300, maxAngleDeg: 60 },
        });
        controller.start();
        // Move CW from 350° by enough to reach forbidden zone and clamp to 60°
        // 350 -> 360 (10°) -> 0 -> 60 (60°) = 70° total = 70/0.6 = 117s = 233 steps of 500ms
        for (let i = 0; i < 240; i++) {
            controller.applyCommand({ type: "slew", direction: "cw" }, 500);
        }
        expect(controller.getState().slew.angleDeg).toBe(60);
    });
});

describe("reset() baseline independence", () => {
    const baseState = createDefaultCraneSimulationState({
        mastHeightM: 40,
        jibLengthM: 30,
        minHookRadiusM: 16.2,
        initialSlewAngleDeg: 0,
    });
    const createCtrl = (state = baseState) => new MotionController(state);

    test("mutating constructor input after creation does not affect reset baseline", () => {
        const initialState = {
            ...baseState,
            hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 10 },
            trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 20 },
            slew: { angleDeg: 30 },
        };
        const controller = new MotionController(initialState);
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);

        // Mutate the original constructor input
        initialState.hoist.heightM = 999;
        initialState.trolley.radiusM = 888;
        initialState.slew.angleDeg = 777;

        // Reset should still restore to original values (10, 20, 30)
        controller.reset();
        const state = controller.getState();
        expect(state.hoist.heightM).toBeCloseTo(10);
        expect(state.trolley.radiusM).toBeCloseTo(20);
        expect(state.slew.angleDeg).toBeCloseTo(30);
    });

    test("mutating object passed to reset(newState) does not affect new baseline", () => {
        const controller = createCtrl();
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);

        const newState = {
            ...baseState,
            hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 15 },
            trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 25 },
            slew: { angleDeg: 45 },
        };
        controller.reset(newState);

        // Mutate the object that was passed to reset()
        newState.hoist.heightM = 999;
        newState.trolley.radiusM = 888;
        newState.slew.angleDeg = 777;

        // Reset again should restore to the values passed to reset() (15, 25, 45)
        controller.reset();
        const state = controller.getState();
        expect(state.hoist.heightM).toBeCloseTo(15);
        expect(state.trolley.radiusM).toBeCloseTo(25);
        expect(state.slew.angleDeg).toBeCloseTo(45);
    });

    test("mutating live state after reset does not corrupt baseline for next reset", () => {
        const controller = createCtrl();
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);
        controller.reset();

        // Mutate live state by moving
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);
        controller.applyCommand({ type: "trolley", direction: "out" }, 1000);
        controller.applyCommand({ type: "slew", direction: "cw" }, 1000);

        // Reset again should still restore to original baseline
        controller.reset();
        const state = controller.getState();
        expect(state.hoist.heightM).toBeCloseTo(38.5); // default initial height
        expect(state.trolley.radiusM).toBeCloseTo(30); // default initial radius
        expect(state.slew.angleDeg).toBeCloseTo(0); // default initial angle
    });
});

describe("Full-circle slew range validation", () => {
    const baseState = createDefaultCraneSimulationState({
        mastHeightM: 40,
        jibLengthM: 30,
        minHookRadiusM: 16.2,
        initialSlewAngleDeg: 0,
    });
    const createCtrl = (state = baseState) => new MotionController(state);

    test("exact 360° span [0, 360] is treated as unrestricted", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 360 },
        });
        controller.setSlewAngle(180);
        expect(controller.getState().slew.angleDeg).toBe(180);
        controller.setSlewAngle(350);
        expect(controller.getState().slew.angleDeg).toBe(350);
    });

    test("exact 360° span [90, 450] is treated as unrestricted", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 100, minAngleDeg: 90, maxAngleDeg: 450 },
        });
        controller.setSlewAngle(200);
        expect(controller.getState().slew.angleDeg).toBe(200);
    });

    test("span > 360° throws at construction", () => {
        expect(() =>
            createCtrl({
                ...baseState,
                slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 361 },
            }),
        ).toThrow(/span of 361° exceeds maximum 360°/);
    });

    test("span > 360° throws at construction before applyCommand", () => {
        expect(() =>
            createCtrl({
                ...baseState,
                slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 361 },
            }),
        ).toThrow(/span of 361° exceeds maximum 360°/);
    });

    test("negative span = 360° [360, 0] is treated as unrestricted", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 360, maxAngleDeg: 0 },
        });
        controller.setSlewAngle(180);
        expect(controller.getState().slew.angleDeg).toBe(180);
    });

    test("exact 360° with negative direction works", () => {
        const controller = createCtrl({
            ...baseState,
            slew: { angleDeg: 360, minAngleDeg: 0, maxAngleDeg: 360 },
        });
        controller.setSlewAngle(90);
        expect(controller.getState().slew.angleDeg).toBe(90);
    });

    test("constructor with span > 360° throws immediately", () => {
        expect(
            () =>
                new MotionController({
                    ...baseState,
                    slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 361 },
                }),
        ).toThrow(/span of 361° exceeds maximum 360°/);
    });
});

describe("reset() validation and state preservation", () => {
    const baseState = createDefaultCraneSimulationState({
        mastHeightM: 40,
        jibLengthM: 30,
        minHookRadiusM: 16.2,
        initialSlewAngleDeg: 0,
    });
    const createCtrl = (state = baseState) => new MotionController(state);

    test("reset(newState) with span > 360° throws and leaves state/baseline unchanged", () => {
        const controller = createCtrl();
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);
        controller.applyCommand({ type: "trolley", direction: "out" }, 1000);
        controller.applyCommand({ type: "slew", direction: "cw" }, 1000);

        const stateBeforeReset = controller.getState();
        const baselineBeforeReset = { ...stateBeforeReset }; // capture for comparison

        // Attempt reset with invalid span
        const invalidState = {
            ...baseState,
            slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 361 },
        };
        expect(() => controller.reset(invalidState)).toThrow(/span of 361° exceeds maximum 360°/);

        // State should be unchanged
        const stateAfterFailedReset = controller.getState();
        expect(stateAfterFailedReset.hoist.heightM).toBeCloseTo(stateBeforeReset.hoist.heightM);
        expect(stateAfterFailedReset.trolley.radiusM).toBeCloseTo(stateBeforeReset.trolley.radiusM);
        expect(stateAfterFailedReset.slew.angleDeg).toBeCloseTo(stateBeforeReset.slew.angleDeg);
        expect(stateAfterFailedReset.status).toBe(stateBeforeReset.status);
        expect(stateAfterFailedReset.lastUpdateTimeMs).toBe(stateBeforeReset.lastUpdateTimeMs);
    });

    test("reset(newState) with invalid velocity limits throws and leaves state/baseline unchanged", () => {
        const controller = createCtrl();
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);

        const stateBeforeReset = controller.getState();

        const invalidState = {
            ...baseState,
            velocityLimits: { hoist: -1, trolley: 1, slew: 1 },
        };
        expect(() => controller.reset(invalidState)).toThrow(/Hoist velocity limit/);

        // State should be unchanged
        const stateAfterFailedReset = controller.getState();
        expect(stateAfterFailedReset.hoist.heightM).toBeCloseTo(stateBeforeReset.hoist.heightM);
        expect(stateAfterFailedReset.status).toBe(stateBeforeReset.status);
    });

    test("reset() without arguments restores from original baseline even after failed reset(newState)", () => {
        const controller = createCtrl();
        const originalHeight = controller.getState().hoist.heightM;
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);

        // Failed reset
        expect(() =>
            controller.reset({
                ...baseState,
                slew: { angleDeg: 0, minAngleDeg: 0, maxAngleDeg: 361 },
            }),
        ).toThrow();

        // Reset without arguments should still work and restore original baseline
        controller.reset();
        expect(controller.getState().hoist.heightM).toBeCloseTo(originalHeight);
        expect(controller.getState().status).toBe("idle");
    });

    test("valid reset(newState) updates baseline for subsequent resets", () => {
        const controller = createCtrl();
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);

        const newState = {
            ...baseState,
            hoist: { minHeightM: 0, maxHeightM: 38.5, heightM: 15 },
            trolley: { minRadiusM: 16.2, maxRadiusM: 30, radiusM: 25 },
            slew: { angleDeg: 45 },
        };
        controller.reset(newState);
        expect(controller.getState().hoist.heightM).toBeCloseTo(15);

        // Move again
        controller.start();
        controller.applyCommand({ type: "hoist", direction: "up" }, 1000);

        // Reset again should restore to newState baseline
        controller.reset();
        expect(controller.getState().hoist.heightM).toBeCloseTo(15);
    });
});
