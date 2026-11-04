// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * Velocity limits for crane motions.
 * All values are INDICATIVE unless a source is explicitly provided.
 * Units: hoist/trolley in m/s, slew in deg/s.
 */
export interface VelocityLimits {
    readonly hoist: number; // m/s
    readonly trolley: number; // m/s
    readonly slew: number; // deg/s
}

/**
 * Default indicative velocity limits for MCT 88.
 * Source: INDICATIVE — typical tower crane speeds for planning purposes.
 * Real values must be sourced from manufacturer documentation.
 */
export const DEFAULT_VELOCITY_LIMITS: VelocityLimits = {
    hoist: 0.8, // m/s — typical hoist speed
    trolley: 0.5, // m/s — typical trolley speed
    slew: 0.6, // deg/s — typical slew speed (≈0.01 rad/s)
};

/**
 * Validates that velocity limits are positive and finite.
 */
export function validateVelocityLimits(limits: VelocityLimits): string[] {
    const errors: string[] = [];
    if (!Number.isFinite(limits.hoist) || limits.hoist <= 0) {
        errors.push("Hoist velocity limit must be a positive finite number (m/s).");
    }
    if (!Number.isFinite(limits.trolley) || limits.trolley <= 0) {
        errors.push("Trolley velocity limit must be a positive finite number (m/s).");
    }
    if (!Number.isFinite(limits.slew) || limits.slew <= 0) {
        errors.push("Slew velocity limit must be a positive finite number (deg/s).");
    }
    return errors;
}
