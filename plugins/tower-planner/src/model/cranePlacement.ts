// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Point2D } from "../geometry";

export const PLANNING_DISCLAIMER = "Planning aid, not a certified lift plan.";
export const BASE_EXCLUSION_RADIUS_M = 20;
export const METRES_TO_MILLIMETRES = 1000;

export type CraneDimensionSource =
    | { readonly kind: "sourced"; readonly document: string; readonly page: number }
    | { readonly kind: "indicative"; readonly note: string };

export interface CraneDimension {
    readonly value: number;
    readonly source: CraneDimensionSource;
}

export interface CraneCatalogue {
    readonly model: string;
    readonly minHookRadius: CraneDimension;
    readonly maxHookRadius: CraneDimension;
    readonly counterJibRadius: CraneDimension;
}

export interface CranePlacement {
    readonly x: number;
    readonly y: number;
    readonly slewAngleDeg: number;
}

export interface CraneRing {
    readonly center: Point2D;
    readonly radius: number;
}

export interface CraneRings {
    readonly minHookRadius: CraneRing;
    readonly maxHookRadius: CraneRing;
    readonly counterJibSweep: CraneRing;
    readonly baseExclusion: CraneRing;
}

export interface CraneLayout {
    readonly catalogue: CraneCatalogue;
    readonly placement: CranePlacement;
    readonly mast: Point2D;
    readonly slewAngleDeg: number;
    readonly jibTip: Point2D;
    readonly counterJibTip: Point2D;
    readonly rings: CraneRings;
}

function indicative(value: number): CraneDimension {
    return {
        value,
        source: {
            kind: "indicative",
            note: "No source attached. Replace with a cited crane load-chart value.",
        },
    };
}

export function createDefaultCraneCatalogue(): CraneCatalogue {
    return {
        model: "INDICATIVE demo tower crane",
        minHookRadius: indicative(16.2),
        maxHookRadius: indicative(40),
        counterJibRadius: indicative(15),
    };
}

export const DEFAULT_TOWER_CRANE_CATALOGUE = createDefaultCraneCatalogue();

export const DEFAULT_TOWER_CRANE_PLACEMENT: CranePlacement = {
    x: 0,
    y: 0,
    slewAngleDeg: 0,
};

export function metresToMillimetres(metres: number): number {
    return metres * METRES_TO_MILLIMETRES;
}

export function millimetresToMetres(millimetres: number): number {
    return millimetres / METRES_TO_MILLIMETRES;
}

export function normalizeAngle(angleDeg: number): number {
    const normalized = angleDeg % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}

export function rotatePoint(point: Point2D, angleDeg: number, origin: Point2D = { x: 0, y: 0 }): Point2D {
    const radians = (angleDeg * Math.PI) / 180;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return {
        x: origin.x + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: origin.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
}

export function pointAtPolar(origin: Point2D, radius: number, angleDeg: number): Point2D {
    const radians = (angleDeg * Math.PI) / 180;
    return {
        x: origin.x + radius * Math.cos(radians),
        y: origin.y + radius * Math.sin(radians),
    };
}

export function sampleCircle(center: Point2D, radius: number, segments = 180): Point2D[] {
    if (!Number.isInteger(segments) || segments < 3) {
        throw new RangeError("segments must be an integer of at least 3");
    }

    const points: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
        points.push(pointAtPolar(center, radius, (i * 360) / segments));
    }
    return points;
}

export function validateCraneCatalogue(catalogue: CraneCatalogue): string[] {
    const errors: string[] = [];
    const checkPositive = (label: string, dimension: CraneDimension) => {
        if (!Number.isFinite(dimension.value) || dimension.value <= 0) {
            errors.push(`${label} must be greater than 0 m.`);
        }
    };

    checkPositive("Minimum hook radius", catalogue.minHookRadius);
    checkPositive("Maximum hook radius", catalogue.maxHookRadius);
    checkPositive("Counter-jib radius", catalogue.counterJibRadius);

    if (catalogue.minHookRadius.value > catalogue.maxHookRadius.value) {
        errors.push("Minimum hook radius must not exceed maximum hook radius.");
    }

    return errors;
}

export function deriveCraneLayout(catalogue: CraneCatalogue, placement: CranePlacement): CraneLayout {
    const mast: Point2D = { x: placement.x, y: placement.y };
    const slewAngleDeg = normalizeAngle(placement.slewAngleDeg);
    const counterJibAngleDeg = slewAngleDeg + 180;

    return {
        catalogue,
        placement,
        mast,
        slewAngleDeg,
        jibTip: pointAtPolar(mast, catalogue.maxHookRadius.value, slewAngleDeg),
        counterJibTip: pointAtPolar(mast, catalogue.counterJibRadius.value, counterJibAngleDeg),
        rings: {
            minHookRadius: { center: mast, radius: catalogue.minHookRadius.value },
            maxHookRadius: { center: mast, radius: catalogue.maxHookRadius.value },
            counterJibSweep: { center: mast, radius: catalogue.counterJibRadius.value },
            baseExclusion: { center: mast, radius: BASE_EXCLUSION_RADIUS_M },
        },
    };
}
