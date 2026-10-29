// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { capacityAt, publishedMaxJibM } from "./capacity";
import type { CapacityModel } from "./types";

/**
 * One lift to check. `loadT` is the total suspended load in tonnes (the caller
 * should include rigging in this value); `radiusM` is the hook radius in metres.
 * All engine calculations stay in metres and tonnes; conversion to millimetres
 * belongs at the Chili3D scene boundary, not here.
 */
export type Pick = {
    loadT: number;
    radiusM: number;
    label?: string;
    /**
     * Per-pick wind override. `undefined` falls back to the crane-level wind
     * setting; `null` explicitly disables the wind derate for this pick.
     */
    windKmh?: number | null;
};

export type PickEvaluationOptions = {
    /** Installed jib length in metres. Defaults to the catalogue's `defaultJibM`. */
    jibM?: number;
    windKmh?: number | null;
};

export type PickIssue =
    | "invalid-load"
    | "invalid-radius"
    | "invalid-wind"
    | "jib-outside-published-range"
    | "invalid-capacity";

export type PickStatus = "PASS" | "FAIL" | "OUT_OF_RANGE" | "INVALID";

export type PickEvaluation = {
    craneId: string;
    craneName: string;
    label: string;
    jibM: number;
    loadT: number;
    radiusM: number;
    windKmh: number | null;
    capacityT: number | null;
    utilisationPct: number | null;
    status: PickStatus;
    issue?: PickIssue;
};

export type CraneEvaluation = {
    craneId: string;
    craneName: string;
    jibM: number;
    windKmh: number | null;
    picks: PickEvaluation[];
    allPass: boolean;
    failedCount: number;
};

export type FindCranesOptions = PickEvaluationOptions & {
    /** Optional jib override keyed by crane id; useful when filtering a mixed fleet. */
    jibMByCrane?: Readonly<Record<string, number>>;
};

const JIB_TOLERANCE_M = 1e-9;
const CHART_JIB_TOLERANCE_M = 1e-6;

function invalid(
    crane: CapacityModel,
    pick: Pick,
    jibM: number,
    windKmh: number | null,
    issue: PickIssue,
): PickEvaluation {
    return {
        craneId: crane.id,
        craneName: crane.name,
        label: pick.label ?? "",
        jibM,
        loadT: pick.loadT,
        radiusM: pick.radiusM,
        windKmh,
        capacityT: null,
        utilisationPct: null,
        status: "INVALID",
        issue,
    };
}

function publishedJibRange(model: CapacityModel): { min: number; max: number } | undefined {
    const rows = model.tipLoadByJib;
    if (rows.length === 0) return undefined;

    const max = publishedMaxJibM(model);
    if (max === undefined) return undefined;

    return {
        min: rows[0].jibM.value,
        max,
    };
}

/**
 * A chart-based crane only has data for the jib lengths the manufacturer
 * published. Tip-load models keep the Cycle 2 range behaviour, which allows
 * interpolation between published rows.
 */
function isPublishedJib(model: CapacityModel, jibM: number): boolean {
    if (!Number.isFinite(jibM)) return false;

    if (model.loadChart !== undefined) {
        return model.loadChart.some((row) => Math.abs(row.jibM.value - jibM) <= CHART_JIB_TOLERANCE_M);
    }

    const range = publishedJibRange(model);
    if (!range) return false;
    return jibM >= range.min - JIB_TOLERANCE_M && jibM <= range.max + JIB_TOLERANCE_M;
}

/**
 * Check one pick against one crane. The engine is UI-independent: it returns
 * data only, and the caller decides how to label PASS/FAIL.
 */
export function evaluatePick(
    crane: CapacityModel,
    pick: Pick,
    options: PickEvaluationOptions = {},
): PickEvaluation {
    const jibM = options.jibM ?? crane.defaultJibM.value;
    const windKmh = pick.windKmh !== undefined ? pick.windKmh : (options.windKmh ?? null);

    if (!Number.isFinite(pick.loadT) || pick.loadT <= 0) {
        return invalid(crane, pick, jibM, windKmh, "invalid-load");
    }

    if (!Number.isFinite(pick.radiusM) || pick.radiusM <= 0) {
        return invalid(crane, pick, jibM, windKmh, "invalid-radius");
    }

    // `null`/`undefined` means "no wind derate"; any supplied wind value must
    // be a finite, non-negative number. Rejecting it here gives the caller a
    // specific issue instead of silently treating bad input as calm weather.
    if (windKmh !== null && (!Number.isFinite(windKmh) || windKmh < 0)) {
        return invalid(crane, pick, jibM, windKmh, "invalid-wind");
    }

    if (!isPublishedJib(crane, jibM)) {
        return invalid(crane, pick, jibM, windKmh, "jib-outside-published-range");
    }

    const capacityT = capacityAt(crane, jibM, pick.radiusM, windKmh);

    if (capacityT === null) {
        return {
            craneId: crane.id,
            craneName: crane.name,
            label: pick.label ?? "",
            jibM,
            loadT: pick.loadT,
            radiusM: pick.radiusM,
            windKmh,
            capacityT: null,
            utilisationPct: null,
            status: "OUT_OF_RANGE",
        };
    }

    if (!Number.isFinite(capacityT) || capacityT <= 0) {
        return invalid(crane, pick, jibM, windKmh, "invalid-capacity");
    }

    const utilisationPct = (pick.loadT / capacityT) * 100;

    return {
        craneId: crane.id,
        craneName: crane.name,
        label: pick.label ?? "",
        jibM,
        loadT: pick.loadT,
        radiusM: pick.radiusM,
        windKmh,
        capacityT,
        utilisationPct,
        status: pick.loadT <= capacityT ? "PASS" : "FAIL",
    };
}

/**
 * Evaluate a pick list against one crane. An empty pick list is not treated as
 * "everything passes": `allPass` is false because the analysis has no evidence.
 */
export function evaluateCrane(
    crane: CapacityModel,
    picks: readonly Pick[],
    options: PickEvaluationOptions = {},
): CraneEvaluation {
    const jibM = options.jibM ?? crane.defaultJibM.value;
    const evaluations = picks.map((pick) => evaluatePick(crane, pick, { jibM, windKmh: options.windKmh }));
    const failedCount = evaluations.filter((evaluation) => evaluation.status !== "PASS").length;

    return {
        craneId: crane.id,
        craneName: crane.name,
        jibM,
        windKmh: options.windKmh ?? null,
        picks: evaluations,
        allPass: evaluations.length > 0 && failedCount === 0,
        failedCount,
    };
}

/**
 * Return the crane evaluations for which every pick passes. This is deliberately
 * generic over `CapacityModel`, so a future sourced crane can be added to the
 * catalogue without changing the filtering code.
 */
export function findCranesPassingAllPicks(
    cranes: readonly CapacityModel[],
    picks: readonly Pick[],
    options: FindCranesOptions = {},
): CraneEvaluation[] {
    return cranes
        .map((crane) =>
            evaluateCrane(crane, picks, {
                jibM: options.jibMByCrane?.[crane.id] ?? options.jibM,
                windKmh: options.windKmh,
            }),
        )
        .filter((evaluation) => evaluation.allPass);
}
