// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { ReportAssumption } from "../../../site-model/src/report";
import type { CraneEvaluation, PickEvaluation, PickStatus } from "../pickEngine";
import type { SourcedNumber, TowerCrane } from "../types";
import type { CranePlacement } from "./cranePlacement";
import type { HeightCheckReport, HeightParameters } from "./heightTypes";
import type { OversailReport, OversailSite } from "./oversailTypes";

/** Report metadata supplied by the caller. The date is never read from the clock. */
export interface TowerPlanMetadata {
    readonly projectName: string;
    readonly siteLocation?: string;
    readonly date: string;
    readonly author: string;
}

/**
 * Provenance of the site model. `source` requires a document and page before it
 * can become VERIFIED; `legacy` covers synthetic/sample sites; `not_stated`
 * is the explicit alternative when no provenance was supplied.
 */
export type TowerPlanSiteProvenance =
    | {
          readonly kind: "source";
          readonly document: string;
          /** Positive-integer PDF page index; labels such as "N/A" are not pages. */
          readonly page?: number;
          readonly note?: string;
      }
    | { readonly kind: "indicative"; readonly basis: string }
    | { readonly kind: "legacy"; readonly note: string }
    | { readonly kind: "not_stated" };

/**
 * Pick statuses understood by the report. `UNSUPPORTED` is included for the
 * luffing-jib catalogue entries that the trolley-jib engine cannot evaluate;
 * the report must preserve it rather than treating the crane as a pass.
 */
export type TowerPlanPickStatus = PickStatus | "UNSUPPORTED";

export type TowerPlanPickEvaluation = Omit<PickEvaluation, "status"> & {
    readonly status: TowerPlanPickStatus;
};

export type TowerPlanCraneEvaluation = Omit<CraneEvaluation, "picks"> & {
    readonly picks: readonly TowerPlanPickEvaluation[];
};

/**
 * The complete, serializable input to a T10 report. It holds actual engine and
 * T8/T9 results; the snapshot builder never recalculates them.
 *
 * `jibM` carries its own provenance because the selected jib can be a published
 * catalogue value or an INDICATIVE project configuration. All lengths are metres.
 */
export interface TowerPlanState {
    readonly metadata: TowerPlanMetadata;
    readonly site: OversailSite | null;
    readonly siteProvenance: TowerPlanSiteProvenance;

    readonly crane: TowerCrane;
    readonly placement: CranePlacement;
    readonly jibM: SourcedNumber;
    readonly windKmh: number | null;

    readonly craneEvaluation: TowerPlanCraneEvaluation;
    readonly oversailReport: OversailReport | null;
    readonly heightReport: HeightCheckReport | null;
    readonly heightParameters: HeightParameters;

    readonly notes?: readonly string[];
    readonly assumptions?: readonly ReportAssumption[];
}
