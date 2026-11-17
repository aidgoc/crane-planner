// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { ReportData } from "../../../site-model/src/report";
import type { TowerPlanMetadata, TowerPlanState } from "../model/towerPlanState";
import type { PickCheckSession } from "./towerPickSession";
import { buildTowerReportData } from "./towerReportAdapter";
import { buildTowerReportSnapshot } from "./towerReportSnapshot";

/** Metadata entered by the user before a captured Pick Check is printed. */
export type TowerPickReportMetadata = TowerPlanMetadata;

export type TowerPickReportMetadataIssue = "project" | "author" | "date";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function hasText(value: string): boolean {
    return value.trim().length > 0;
}

/** A real calendar date written as YYYY-MM-DD, using the same rule as S7. */
export function isTowerPickReportDate(value: string): boolean {
    if (!ISO_DATE.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * The report needs a project, an author and a real date. Site location is
 * optional: the report prints it only when the user supplied one.
 */
export function validateTowerPickReportMetadata(
    metadata: TowerPickReportMetadata,
): TowerPickReportMetadataIssue | undefined {
    if (!hasText(metadata.projectName)) return "project";
    if (!hasText(metadata.author)) return "author";
    if (!isTowerPickReportDate(metadata.date)) return "date";
    return undefined;
}

/**
 * Trim user-entered text and omit a blank optional site location, so the
 * report does not print empty metadata rows.
 */
export function normalizeTowerPickReportMetadata(metadata: TowerPickReportMetadata): TowerPlanMetadata {
    const siteLocation = metadata.siteLocation?.trim();

    return {
        projectName: metadata.projectName.trim(),
        ...(siteLocation ? { siteLocation } : {}),
        date: metadata.date.trim(),
        author: metadata.author.trim(),
    };
}

/**
 * Build the report state from the captured Pick Check. The mast X/Y, crane,
 * jib, wind, picks and selected-crane evaluation are copied from the session;
 * nothing is re-evaluated.
 *
 * No slew angle, site geometry, T8 oversail result, T9 height result or T9
 * height parameters are supplied. They are intentionally absent so the
 * snapshot discloses those checks as not performed instead of inventing a
 * value or a PASS.
 */
export function buildTowerPickPlanState(
    session: PickCheckSession,
    metadata: TowerPickReportMetadata,
): TowerPlanState {
    const issue = validateTowerPickReportMetadata(metadata);
    if (issue !== undefined) {
        throw new RangeError(`Tower pick report metadata is invalid: ${issue}`);
    }

    return {
        metadata: normalizeTowerPickReportMetadata(metadata),
        site: null,
        siteProvenance: { kind: "not_stated" },
        crane: session.crane,
        placement: { x: session.mast.x, y: session.mast.y },
        jibM: session.jibM,
        windKmh: session.windKmh,
        craneEvaluation: session.evaluation,
        oversailReport: null,
        heightReport: null,
    };
}

/**
 * Pure snapshot -> S7 data path for a captured Pick Check report. It does not
 * read the DOM, viewport or clock, does not recalculate capacity, and does not
 * run or invent T8/T9 checks.
 */
export function buildTowerPickReport(
    session: PickCheckSession,
    metadata: TowerPickReportMetadata,
): ReportData {
    const state = buildTowerPickPlanState(session, metadata);
    return buildTowerReportData(buildTowerReportSnapshot(state));
}
