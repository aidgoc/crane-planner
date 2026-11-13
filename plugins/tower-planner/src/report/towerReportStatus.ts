// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { MetricStatus, VerdictStatus } from "../../../site-model/src/report";
import type { CraneDimension } from "../model/cranePlacement";
import type { HeightStatus } from "../model/heightTypes";
import type { OversailStatus } from "../model/oversailTypes";
import type { TowerPlanPickStatus, TowerPlanSiteProvenance } from "../model/towerPlanState";
import type { JibLoadChart, LoadChartPoint, SourceDocument, SourcedNumber, TowerCrane } from "../types";
import type { TowerReportSource } from "./towerReportTypes";

/**
 * Statuses that mean a check did not produce a verified pass. `INFO` is
 * included because an informational row is not evidence that a check passed.
 */
const INCOMPLETE_STATUSES: ReadonlySet<MetricStatus> = new Set([
    "NOT_CHECKED",
    "OUT_OF_RANGE",
    "UNSUPPORTED",
    "INVALID",
    "INFO",
]);

/** Published chart rows are matched at the same tolerance as the capacity engine. */
const JIB_MATCH_TOLERANCE_M = 1e-6;

/**
 * Map any Tower status to the report vocabulary. A check that did not run or
 * could not be evaluated is never converted to PASS or FAIL.
 */
export function toMetricStatus(
    status: TowerPlanPickStatus | OversailStatus | HeightStatus | null | undefined,
): MetricStatus {
    switch (status) {
        case "PASS":
        case "pass":
            return "PASS";
        case "FAIL":
        case "fail":
            return "FAIL";
        case "permission_needed":
        case "tie_in_required":
            return "WARN";
        case "unavailable":
            return "NOT_CHECKED";
        case "OUT_OF_RANGE":
            return "OUT_OF_RANGE";
        case "UNSUPPORTED":
            return "UNSUPPORTED";
        case "INVALID":
            return "INVALID";
        case null:
        case undefined:
            return "NOT_CHECKED";
        default:
            return "NOT_CHECKED";
    }
}

/**
 * Overall verdict precedence: FAIL, then INCOMPLETE, then WARN, then PASS.
 * An empty status list is INCOMPLETE because no check was evaluated.
 */
export function verdictFromStatuses(statuses: readonly MetricStatus[]): VerdictStatus {
    if (statuses.includes("FAIL")) return "FAIL";
    if (statuses.length === 0 || statuses.some((status) => INCOMPLETE_STATUSES.has(status))) {
        return "INCOMPLETE";
    }
    if (statuses.includes("WARN")) return "WARN";
    return "PASS";
}

function isNonEmptyText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * A page is only usable when it is the positive integer PDF page index used by
 * the catalogue. `0`, negative, fractional, blank and label strings such as
 * "N/A" are not pages and must never make a source VERIFIED.
 */
function isPage(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function notStated(item: string, note: string): TowerReportSource {
    return { item, status: "NOT_STATED", note };
}

function withNote(source: TowerReportSource, note: string): TowerReportSource {
    return { ...source, note: source.note ? `${source.note} ${note}` : note };
}

function sameAttribution(a: TowerReportSource, b: TowerReportSource): boolean {
    if (a.status !== b.status) return false;
    if (a.status === "VERIFIED") return a.document === b.document && a.page === b.page;
    if (a.status === "INDICATIVE") return a.basis === b.basis;
    return false;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * Resolve one published chart point's provenance. Both the radius and the
 * capacity are checked: a point is only usable when both halves agree on a
 * single source/indicative attribution.
 */
function chartPointProvenance(
    item: string,
    point: LoadChartPoint,
    sources: Readonly<Record<string, SourceDocument>>,
): TowerReportSource {
    const radius = mapSourcedNumber(item, point.radiusM, sources);
    if (radius.status === "NOT_STATED") return radius;

    const capacity = mapSourcedNumber(item, point.capacityT, sources);
    if (capacity.status === "NOT_STATED") return capacity;

    if (!sameAttribution(radius, capacity)) {
        return notStated(
            item,
            "The published radius and capacity of one chart point do not share a single attribution.",
        );
    }
    return capacity;
}

/**
 * Mirror the point selection in `chartCapacityAt` (`capacity.ts`) without
 * recomputing capacity. A radius on the flat plateau uses point 0; a radius
 * above it uses the two bounding published points because the engine takes the
 * lower of their capacities.
 */
function chartPointIndexesForRadius(chart: JibLoadChart, radiusM: number): readonly number[] | null {
    const points = chart.points;
    if (!Array.isArray(points) || points.length === 0) return null;

    const minRadiusM = chart.minRadiusM?.value;
    if (!isFiniteNumber(minRadiusM) || minRadiusM <= 0) return null;
    if (!isFiniteNumber(radiusM)) return null;
    if (radiusM < minRadiusM - 1e-9) return null;

    const first = points[0];
    const firstRadiusM = first?.radiusM?.value;
    if (!isFiniteNumber(firstRadiusM)) return null;
    if (radiusM <= firstRadiusM) return [0];

    const last = points[points.length - 1];
    const lastRadiusM = last?.radiusM?.value;
    if (!isFiniteNumber(lastRadiusM)) return null;
    if (radiusM > lastRadiusM + 1e-9) return null;

    for (let index = 0; index < points.length - 1; index++) {
        const upperRadiusM = points[index + 1]?.radiusM?.value;
        if (isFiniteNumber(upperRadiusM) && radiusM <= upperRadiusM + 1e-9) {
            return [index, index + 1];
        }
    }

    return [points.length - 1];
}

function describeChartPoint(point: LoadChartPoint): string {
    return `${String(point.radiusM?.value)} m (${String(point.capacityT?.value)} t)`;
}

/**
 * A sourced value is VERIFIED only when its sourceId resolves to a document
 * and a positive-integer page. An unresolved sourceId is NOT_STATED, never
 * VERIFIED.
 */
export function mapSourcedNumber(
    item: string,
    value: SourcedNumber | null | undefined,
    sources: Readonly<Record<string, SourceDocument>> | null | undefined,
): TowerReportSource {
    if (!value || !Number.isFinite(value.value)) {
        return notStated(item, "Value was not supplied or is not finite.");
    }

    const provenance = value.provenance;
    if (!provenance || typeof provenance !== "object") {
        return notStated(item, "No provenance was supplied.");
    }

    if (provenance.kind === "source") {
        if (!isNonEmptyText(provenance.sourceId)) {
            return notStated(item, "Source provenance has no sourceId.");
        }
        if (!sources || typeof sources !== "object") {
            return notStated(item, "The crane source table is missing.");
        }
        // Match the catalogue validator: inherited keys such as `__proto__` or
        // `constructor` must not masquerade as declared source ids.
        if (!Object.hasOwn(sources, provenance.sourceId)) {
            return notStated(
                item,
                `Source '${provenance.sourceId}' was not found in the crane source table.`,
            );
        }
        const source = sources[provenance.sourceId];
        if (!source) {
            return notStated(
                item,
                `Source '${provenance.sourceId}' was not found in the crane source table.`,
            );
        }
        if (!isNonEmptyText(source.document)) {
            return notStated(item, `Source '${provenance.sourceId}' has no document.`);
        }
        if (!isPage(source.page)) {
            return notStated(item, `Source '${provenance.sourceId}' has no positive-integer page.`);
        }
        return {
            item,
            status: "VERIFIED",
            document: source.document.trim(),
            page: source.page,
        };
    }

    if (provenance.kind === "indicative") {
        if (!isNonEmptyText(provenance.basis)) {
            return notStated(item, "INDICATIVE provenance must explain its basis.");
        }
        return {
            item,
            status: "INDICATIVE",
            basis: provenance.basis.trim(),
        };
    }

    return notStated(item, "Provenance must be a source or an INDICATIVE basis.");
}

/**
 * Map the `CraneDimension` provenance used by the placement panel and T9
 * parameters. This is the path that keeps the default demo dimensions
 * INDICATIVE rather than VERIFIED.
 */
export function mapCraneDimension(
    item: string,
    dimension: CraneDimension | null | undefined,
): TowerReportSource {
    if (!dimension || !Number.isFinite(dimension.value)) {
        return notStated(item, "Value was not supplied or is not finite.");
    }

    const source = dimension.source;
    if (!source || typeof source !== "object") {
        return notStated(item, "No provenance was supplied.");
    }

    if (source.kind === "sourced") {
        if (!isNonEmptyText(source.document) || !isPage(source.page)) {
            return notStated(item, "Sourced dimension is missing its document or positive-integer page.");
        }
        return {
            item,
            status: "VERIFIED",
            document: source.document.trim(),
            page: source.page,
        };
    }

    if (source.kind === "indicative") {
        if (!isNonEmptyText(source.note)) {
            return notStated(item, "INDICATIVE provenance must explain its basis.");
        }
        return {
            item,
            status: "INDICATIVE",
            basis: source.note.trim(),
        };
    }

    return notStated(item, "No usable provenance was supplied.");
}

/** Map the site-model provenance, including explicit LEGACY sample data. */
export function mapSiteProvenance(provenance: TowerPlanSiteProvenance | null | undefined): TowerReportSource {
    if (!provenance || typeof provenance !== "object") {
        return notStated("Site model", "No site provenance was supplied.");
    }

    switch (provenance.kind) {
        case "source":
            if (!isNonEmptyText(provenance.document) || !isPage(provenance.page)) {
                return notStated(
                    "Site model",
                    "Site source is missing its document or positive-integer page.",
                );
            }
            return {
                item: "Site model",
                status: "VERIFIED",
                document: provenance.document.trim(),
                page: provenance.page,
                note: isNonEmptyText(provenance.note) ? provenance.note.trim() : undefined,
            };
        case "indicative":
            if (!isNonEmptyText(provenance.basis)) {
                return notStated("Site model", "INDICATIVE site provenance must explain its basis.");
            }
            return {
                item: "Site model",
                status: "INDICATIVE",
                basis: provenance.basis.trim(),
            };
        case "legacy":
            if (!isNonEmptyText(provenance.note)) {
                return notStated("Site model", "LEGACY site provenance must include a note.");
            }
            return {
                item: "Site model",
                status: "LEGACY",
                note: provenance.note.trim(),
            };
        case "not_stated":
            return notStated("Site model", "No site provenance was supplied.");
        default:
            return notStated("Site model", "No usable site provenance was supplied.");
    }
}

/**
 * Resolve the capacity basis for the selected jib from the exact catalogue
 * row used by the capacity engine. A load-chart crane is cited from the exact
 * published point or bounding point pair used at each supplied pick radius
 * that carries a finite capacity; picks with `capacityT: null` are not
 * attributed. A tip-load crane is cited from the bounding published tip-load
 * row(s). Missing or inconsistent evidence is NOT_STATED rather than guessed.
 */
export function mapCapacityBasis(
    crane: TowerCrane,
    jibM: number,
    radiiM?: readonly number[],
): TowerReportSource {
    const item = "Capacity basis";

    if (!crane || typeof crane !== "object") {
        return notStated(item, "No crane was supplied.");
    }
    if (!Number.isFinite(jibM) || jibM <= 0) {
        return notStated(item, "The selected jib length is not a finite positive value.");
    }
    if (crane.loadChart !== undefined) {
        if (!Array.isArray(crane.loadChart) || crane.loadChart.length === 0) {
            return notStated(item, "The crane has no load-chart rows.");
        }
        const chart = crane.loadChart.find((row) => {
            const rowJibM = row?.jibM?.value;
            return (
                typeof rowJibM === "number" &&
                Number.isFinite(rowJibM) &&
                Math.abs(rowJibM - jibM) <= JIB_MATCH_TOLERANCE_M
            );
        });
        if (!chart) {
            return notStated(item, `No published load chart covers the selected ${jibM} m jib.`);
        }
        if (!Array.isArray(chart.points) || chart.points.length === 0) {
            return notStated(item, `The ${jibM} m load chart has no published capacity points.`);
        }

        const usedIndexes = new Set<number>();
        const usedRadiiM = new Set<number>();
        if (radiiM !== undefined) {
            if (radiiM.length === 0) {
                return notStated(
                    item,
                    `No supplied pick evaluation carries a finite capacity on the ${jibM} m load chart; the capacity basis cannot be attributed to a pick.`,
                );
            }
            for (const radiusM of radiiM) {
                const indexes = chartPointIndexesForRadius(chart, radiusM);
                if (!indexes) continue;
                usedRadiiM.add(radiusM);
                for (const index of indexes) usedIndexes.add(index);
            }
            if (usedIndexes.size === 0) {
                return notStated(
                    item,
                    `No supplied pick radius uses a published point on the ${jibM} m load chart.`,
                );
            }
        } else {
            // No pick rows were supplied: check the whole row so a mixed-provenance
            // chart is never presented as one verified source.
            for (let index = 0; index < chart.points.length; index++) usedIndexes.add(index);
        }

        const attributions: TowerReportSource[] = [];
        const pointDescriptions: string[] = [];
        for (const index of [...usedIndexes].sort((a, b) => a - b)) {
            const point = chart.points[index];
            if (!point || typeof point !== "object") {
                return notStated(item, `Chart point ${index + 1} on the ${jibM} m load chart is malformed.`);
            }

            const attribution = chartPointProvenance(item, point, crane.sources);
            if (attribution.status === "NOT_STATED") return attribution;

            attributions.push(attribution);
            pointDescriptions.push(describeChartPoint(point));
        }

        const base = attributions[0];
        if (!base) {
            return notStated(item, `The ${jibM} m load chart has no usable published points.`);
        }
        if (attributions.some((attribution) => !sameAttribution(base, attribution))) {
            return notStated(
                item,
                `The pick radii use chart points with different provenance on the ${jibM} m load chart; capacity cannot be attributed to one resolved source.`,
            );
        }

        const pointsUsed = pointDescriptions.join(" and ");
        const radiiUsed = [...usedRadiiM].sort((a, b) => a - b).map((radiusM) => `${radiusM} m`);
        const note =
            radiiM !== undefined
                ? `Capacity for the supplied pick radius(es) ${radiiUsed.join(", ")} is derived from the published point(s): ${pointsUsed}. Per-radius load chart for the ${jibM} m jib; at an unpublished radius the lower of the two bounding published values is used and capacity is not extrapolated beyond the published radius.`
                : `All published points on the ${jibM} m chart row share the same attribution: ${pointsUsed}. Per-radius load chart for the ${jibM} m jib; at an unpublished radius the lower of the two bounding published values is used and capacity is not extrapolated beyond the published radius.`;
        return withNote(base, note);
    }

    const rows = Array.isArray(crane.tipLoadByJib) ? crane.tipLoadByJib : [];
    if (rows.length === 0) {
        return notStated(item, "The crane has no tip-load rows.");
    }

    const firstJibM = rows[0]?.jibM?.value;
    const lastJibM = rows[rows.length - 1]?.jibM?.value;
    if (
        typeof firstJibM !== "number" ||
        typeof lastJibM !== "number" ||
        !Number.isFinite(firstJibM) ||
        !Number.isFinite(lastJibM)
    ) {
        return notStated(item, "The tip-load table has no usable jib lengths.");
    }
    if (jibM < firstJibM - JIB_MATCH_TOLERANCE_M || jibM > lastJibM + JIB_MATCH_TOLERANCE_M) {
        return notStated(
            item,
            `The selected ${jibM} m jib is outside the published tip-load range ${firstJibM}-${lastJibM} m.`,
        );
    }

    const exact = rows.find((row) => {
        const rowJibM = row?.jibM?.value;
        return rowJibM === jibM;
    });

    if (exact) {
        const base = mapSourcedNumber(item, exact.tipT, crane.sources);
        if (base.status === "NOT_STATED") return base;
        return withNote(
            base,
            `Tip-load idealisation: capacity is derived from the published ${exact.jibM.value} m tip load and jib length, not a per-radius load chart.`,
        );
    }

    // `tipLoadAt` clamps at the first/last published row. Keep the report's
    // boundary citation in step with that behaviour instead of using a loose
    // equality tolerance that would call a genuinely interpolated capacity an
    // exact-row lookup.
    if (jibM <= firstJibM) {
        const first = rows[0];
        const base = mapSourcedNumber(item, first.tipT, crane.sources);
        if (base.status === "NOT_STATED") return base;
        return withNote(
            base,
            `Tip-load idealisation: the selected ${jibM} m jib is at or below the first published ${firstJibM} m row, so capacity uses the published ${firstJibM} m tip load and jib length.`,
        );
    }
    if (jibM >= lastJibM) {
        const last = rows[rows.length - 1];
        const base = mapSourcedNumber(item, last.tipT, crane.sources);
        if (base.status === "NOT_STATED") return base;
        return withNote(
            base,
            `Tip-load idealisation: the selected ${jibM} m jib is at or above the last published ${lastJibM} m row, so capacity uses the published ${lastJibM} m tip load and jib length.`,
        );
    }

    for (let index = 0; index < rows.length - 1; index++) {
        const lower = rows[index];
        const upper = rows[index + 1];
        const lowerJibM = lower?.jibM?.value;
        const upperJibM = upper?.jibM?.value;
        if (
            typeof lowerJibM !== "number" ||
            typeof upperJibM !== "number" ||
            !Number.isFinite(lowerJibM) ||
            !Number.isFinite(upperJibM)
        ) {
            continue;
        }
        if (jibM > lowerJibM && jibM < upperJibM) {
            const lowerSource = mapSourcedNumber(item, lower.tipT, crane.sources);
            const upperSource = mapSourcedNumber(item, upper.tipT, crane.sources);
            if (!sameAttribution(lowerSource, upperSource)) {
                return notStated(
                    item,
                    `Interpolation between the ${lowerJibM} m and ${upperJibM} m tip-load rows cannot be attributed to one resolved source.`,
                );
            }
            return withNote(
                lowerSource,
                `Interpolated between the published ${lowerJibM} m and ${upperJibM} m tip-load rows; capacity uses the Cycle 2 tip-load idealisation, not a per-radius load chart.`,
            );
        }
    }

    return notStated(item, `No published tip-load rows bound the selected ${jibM} m jib.`);
}
