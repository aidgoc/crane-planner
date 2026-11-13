// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type {
    MetricStatus,
    ReportAssumption,
    SourceStatus,
    VerdictStatus,
} from "../../../site-model/src/report";
import type { CranePlacement } from "../model/cranePlacement";
import type { HeightCheckReport, HeightCheckResult, HeightParameters } from "../model/heightTypes";
import type { OversailCheckResult, OversailSite } from "../model/oversailTypes";
import type { TowerPlanMetadata, TowerPlanPickEvaluation } from "../model/towerPlanState";
import type { TowerCrane } from "../types";

/**
 * One attribution in the snapshot. This is deliberately not S7's `ReportSource`
 * because an INDICATIVE value has a basis but no document/page. The S7 adapter
 * splits these entries into its sources table and assumptions section.
 */
export interface TowerReportSource {
    readonly item: string;
    readonly status: SourceStatus;
    readonly document?: string;
    /** Positive-integer PDF page index; unresolved labels are reported as NOT_STATED. */
    readonly page?: number;
    readonly basis?: string;
    readonly note?: string;
}

/**
 * Evaluation-level settings and outcome counters from the capacity engine.
 * They are preserved so the report can prove that the displayed crane, jib
 * and wind setting are the ones the pick rows were evaluated with.
 */
export interface TowerReportEvaluation {
    readonly craneId: string;
    readonly craneName: string;
    readonly jibM: number;
    readonly windKmh: number | null;
    readonly allPass: boolean;
    readonly failedCount: number;
}

export type TowerReportPick = Readonly<Omit<TowerPlanPickEvaluation, "status">> & {
    readonly status: MetricStatus;
};

export type TowerReportOversailResult = Readonly<Omit<OversailCheckResult, "status">> & {
    readonly status: MetricStatus;
};

export type TowerReportHeightResult = Readonly<Omit<HeightCheckResult, "status">> & {
    readonly status: MetricStatus;
};

export interface TowerReportOversail {
    readonly overallStatus: MetricStatus;
    readonly results: readonly TowerReportOversailResult[];
}

export type TowerReportHeight = Readonly<Omit<HeightCheckReport, "overallStatus" | "results">> & {
    readonly overallStatus: MetricStatus;
    readonly results: readonly TowerReportHeightResult[];
    readonly parameters: HeightParameters;
};

/** One row for the report's failed/unresolved-checks section. */
export interface TowerReportCheck {
    readonly category: "pick" | "oversail" | "height";
    readonly id: string;
    readonly label: string;
    readonly status: MetricStatus;
    readonly message: string;
    readonly requiredM?: number;
    readonly availableM?: number;
}

/** A check that was not performed, with the reason shown in the report. */
export interface TowerReportNotChecked {
    readonly item: string;
    readonly reason: string;
}

/**
 * Deterministic, report-ready snapshot of a tower plan. It contains only data
 * from `TowerPlanState`; no value is recalculated by the builder.
 */
export interface TowerReportSnapshot {
    readonly metadata: TowerPlanMetadata;
    readonly site: OversailSite | null;
    readonly siteSource: TowerReportSource | null;

    readonly crane: TowerCrane;
    readonly placement: CranePlacement;
    readonly jibM: number;
    readonly windKmh: number | null;
    readonly evaluation: TowerReportEvaluation;

    readonly picks: readonly TowerReportPick[];
    readonly oversail: TowerReportOversail | null;
    readonly height: TowerReportHeight | null;
    /** Always present, even when no T9 report was supplied. */
    readonly heightParameters: HeightParameters;

    readonly verdict: VerdictStatus;
    readonly failedChecks: readonly TowerReportCheck[];
    readonly notChecked: readonly TowerReportNotChecked[];

    readonly sources: readonly TowerReportSource[];
    readonly assumptions: readonly ReportAssumption[];
    readonly notes: readonly string[];
}
