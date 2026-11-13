// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { MetricStatus, ReportAssumption } from "../../../site-model/src/report";
import { WIND_DERATE_RULE } from "../capacity";
import type { Point2D, Polygon2D } from "../geometry";
import type { CraneDimension } from "../model/cranePlacement";
import type { HeightParameters } from "../model/heightTypes";
import type { OversailSite } from "../model/oversailTypes";
import type {
    TowerPlanCraneEvaluation,
    TowerPlanPickEvaluation,
    TowerPlanState,
} from "../model/towerPlanState";
import type {
    CatalogueNumber,
    HeaviestErectionComponent,
    LoadChartPoint,
    NotStated,
    SourcedNumber,
    TowerCrane,
} from "../types";
import {
    mapCapacityBasis,
    mapCraneDimension,
    mapSiteProvenance,
    mapSourcedNumber,
    toMetricStatus,
    verdictFromStatuses,
} from "./towerReportStatus";
import type {
    TowerReportCheck,
    TowerReportEvaluation,
    TowerReportHeight,
    TowerReportHeightResult,
    TowerReportNotChecked,
    TowerReportOversail,
    TowerReportOversailResult,
    TowerReportPick,
    TowerReportSnapshot,
    TowerReportSource,
} from "./towerReportTypes";

function clonePoint(point: Point2D): Point2D {
    return {
        x: typeof point?.x === "number" ? point.x : Number.NaN,
        y: typeof point?.y === "number" ? point.y : Number.NaN,
    };
}

function clonePolygon(polygon: Polygon2D): Polygon2D {
    return Array.isArray(polygon) ? polygon.map(clonePoint) : [];
}

function isFinitePoint(point: Point2D | null | undefined): boolean {
    return !!point && typeof point === "object" && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/**
 * A site is only usable when it carries a boundary polygon with at least three
 * points and finite coordinates. A malformed boundary is treated like a missing
 * site so it cannot produce a verified T8 result.
 */
function hasUsableSite(site: OversailSite | null | undefined): site is OversailSite {
    if (!site?.boundary || !Array.isArray(site.boundary.polygon)) {
        return false;
    }
    return site.boundary.polygon.length >= 3 && site.boundary.polygon.every(isFinitePoint);
}

function cloneSite(site: OversailSite): OversailSite {
    return {
        boundary: {
            ...site.boundary,
            polygon: clonePolygon(site.boundary.polygon),
        },
        neighbours: (Array.isArray(site.neighbours) ? site.neighbours : []).flatMap((neighbour) =>
            neighbour && typeof neighbour === "object"
                ? [{ ...neighbour, polygon: clonePolygon(neighbour.polygon) }]
                : [],
        ),
        noGoZones: (Array.isArray(site.noGoZones) ? site.noGoZones : []).flatMap((zone) =>
            zone && typeof zone === "object" ? [{ ...zone, center: clonePoint(zone.center) }] : [],
        ),
        buildings: Array.isArray(site.buildings)
            ? site.buildings.flatMap((building) =>
                  building && typeof building === "object" ? [{ ...building }] : [],
              )
            : undefined,
        road: site.road && typeof site.road === "object" ? { ...site.road } : undefined,
        powerLine: site.powerLine && typeof site.powerLine === "object" ? { ...site.powerLine } : undefined,
    };
}

function cloneSourcedNumber(value: SourcedNumber | null | undefined): SourcedNumber {
    const numericValue = typeof value?.value === "number" ? value.value : Number.NaN;
    const provenance = value?.provenance;
    if (provenance?.kind === "source" && typeof provenance.sourceId === "string") {
        return {
            value: numericValue,
            provenance: { kind: "source", sourceId: provenance.sourceId },
        };
    }
    if (provenance?.kind === "indicative" && typeof provenance.basis === "string") {
        return {
            value: numericValue,
            provenance: { kind: "indicative", basis: provenance.basis },
        };
    }
    // The catalogue type requires provenance, but a cloned report value must not
    // invent an INDICATIVE label when the caller supplied none. Preserve the
    // absence; the authoritative `sources` table reports it as NOT_STATED.
    return { value: numericValue, provenance: undefined } as unknown as SourcedNumber;
}

function isNotStated(value: unknown): value is NotStated {
    return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "notStated";
}

function cloneCatalogueNumber(value: CatalogueNumber | null | undefined): CatalogueNumber {
    return isNotStated(value) ? { kind: "notStated", reason: value.reason } : cloneSourcedNumber(value);
}

function cloneCraneDimension(dimension: CraneDimension | null | undefined): CraneDimension {
    const numericValue = typeof dimension?.value === "number" ? dimension.value : Number.NaN;
    const source = dimension?.source;
    if (source?.kind === "sourced") {
        return {
            value: numericValue,
            source: { kind: "sourced", document: source.document, page: source.page },
        };
    }
    if (source?.kind === "indicative") {
        return {
            value: numericValue,
            source: { kind: "indicative", note: source.note },
        };
    }
    // Same rule as `cloneSourcedNumber`: missing provenance stays missing rather
    // than being presented as an INDICATIVE project assumption.
    return { value: numericValue, source: undefined } as unknown as CraneDimension;
}

function cloneHeightParameters(parameters: HeightParameters): HeightParameters {
    return {
        hookHeight: cloneCraneDimension(parameters.hookHeight),
        hookClearance: cloneCraneDimension(parameters.hookClearance),
        freestandingHeight: cloneCraneDimension(parameters.freestandingHeight),
        tieInSpacing: cloneCraneDimension(parameters.tieInSpacing),
    };
}

function cloneCrane(crane: TowerCrane): TowerCrane {
    const sources = crane.sources ?? {};
    return {
        ...crane,
        maxCapacityT: cloneSourcedNumber(crane.maxCapacityT),
        defaultJibM: cloneSourcedNumber(crane.defaultJibM),
        maxJibLengthM: cloneSourcedNumber(crane.maxJibLengthM),
        tipLoadByJib: (Array.isArray(crane.tipLoadByJib) ? crane.tipLoadByJib : []).flatMap((row) =>
            row && typeof row === "object"
                ? [{ jibM: cloneSourcedNumber(row.jibM), tipT: cloneSourcedNumber(row.tipT) }]
                : [],
        ),
        loadChart: Array.isArray(crane.loadChart)
            ? crane.loadChart.flatMap((chart) =>
                  chart && typeof chart === "object"
                      ? [
                            {
                                jibM: cloneSourcedNumber(chart.jibM),
                                minRadiusM: cloneSourcedNumber(chart.minRadiusM),
                                points: (Array.isArray(chart.points) ? chart.points : []).flatMap(
                                    (point: LoadChartPoint) =>
                                        point && typeof point === "object"
                                            ? [
                                                  {
                                                      radiusM: cloneSourcedNumber(point.radiusM),
                                                      capacityT: cloneSourcedNumber(point.capacityT),
                                                  },
                                              ]
                                            : [],
                                ),
                            },
                        ]
                      : [],
              )
            : undefined,
        dimensions: {
            mastWidthM: cloneCatalogueNumber(crane.dimensions?.mastWidthM),
            baseWidthM: cloneCatalogueNumber(crane.dimensions?.baseWidthM),
            counterJibLengthM: cloneCatalogueNumber(crane.dimensions?.counterJibLengthM),
            counterJibRadiusM: cloneCatalogueNumber(crane.dimensions?.counterJibRadiusM),
        },
        heaviestErectionComponent: isNotStated(crane.heaviestErectionComponent)
            ? { kind: "notStated", reason: crane.heaviestErectionComponent.reason }
            : {
                  ...crane.heaviestErectionComponent,
                  massT: cloneSourcedNumber(crane.heaviestErectionComponent?.massT),
              },
        sources: Object.fromEntries(Object.entries(sources).map(([id, document]) => [id, { ...document }])),
    };
}

function mapEvaluation(evaluation: TowerPlanCraneEvaluation | undefined): TowerReportEvaluation {
    return {
        craneId: evaluation?.craneId ?? "",
        craneName: evaluation?.craneName ?? "",
        jibM: evaluation?.jibM ?? Number.NaN,
        windKmh: evaluation?.windKmh ?? null,
        allPass: evaluation?.allPass ?? false,
        failedCount: evaluation?.failedCount ?? Number.NaN,
    };
}

function mapPick(pick: TowerPlanPickEvaluation): TowerReportPick {
    return {
        ...pick,
        status: toMetricStatus(pick.status),
    };
}

function mapOversail(report: TowerPlanState["oversailReport"]): TowerReportOversail | null {
    if (!report) return null;
    const results: TowerReportOversailResult[] = (report.results ?? []).map((result) => ({
        ...result,
        status: toMetricStatus(result.status),
    }));
    return {
        overallStatus: toMetricStatus(report.overallStatus),
        results,
    };
}

function mapHeight(
    report: TowerPlanState["heightReport"],
    parameters: HeightParameters,
): TowerReportHeight | null {
    if (!report) return null;
    const results: TowerReportHeightResult[] = (report.results ?? []).map((result) => ({
        ...result,
        status: toMetricStatus(result.status),
    }));
    return {
        ...report,
        errors: [...(report.errors ?? [])],
        results,
        overallStatus: toMetricStatus(report.overallStatus),
        controllingBuilding: report.controllingBuilding ? { ...report.controllingBuilding } : undefined,
        tieInLevelsM: [...(report.tieInLevelsM ?? [])],
        parameters: cloneHeightParameters(parameters),
    };
}

function sameFiniteNumber(a: number | null | undefined, b: number | null | undefined): boolean {
    return (
        typeof a === "number" &&
        typeof b === "number" &&
        Number.isFinite(a) &&
        Number.isFinite(b) &&
        Math.abs(a - b) <= 1e-9
    );
}

function sameWind(a: number | null | undefined, b: number | null | undefined): boolean {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    return sameFiniteNumber(a, b);
}

/**
 * A pick row's wind is valid when it explicitly disables the derate (`null`)
 * or supplies a finite, non-negative value. Per-pick overrides are supported by
 * `evaluatePick`; they are disclosed by `buildAssumptions`, not treated as a
 * crane-level wind setting.
 */
function isValidPickWind(value: number | null | undefined): boolean {
    return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

/**
 * Compare the evaluation settings with the configuration the report displays
 * and with the status of the individual pick rows. This is a consistency check
 * only: the builder never recalculates a pick or a capacity.
 */
function findEvaluationIssues(
    state: TowerPlanState,
    evaluation: TowerPlanCraneEvaluation | undefined,
    picks: readonly TowerReportPick[],
): string[] {
    const issues: string[] = [];
    if (!evaluation) {
        return ["No crane evaluation was supplied."];
    }

    if (evaluation.craneId !== state.crane.id) {
        issues.push(
            `The pick evaluation is for crane '${String(evaluation.craneId)}' but the report selects '${state.crane.id}'.`,
        );
    }
    if (evaluation.craneName !== state.crane.name) {
        issues.push(
            `The pick evaluation names crane '${String(evaluation.craneName)}' but the report selects '${state.crane.name}'.`,
        );
    }
    if (!sameFiniteNumber(evaluation.jibM, state.jibM.value)) {
        issues.push(
            `The pick evaluation uses a ${String(evaluation.jibM)} m jib but the report displays ${state.jibM.value} m.`,
        );
    }
    if (!sameWind(evaluation.windKmh, state.windKmh)) {
        issues.push(
            `The pick evaluation uses wind '${String(evaluation.windKmh)}' but the report displays '${String(state.windKmh)}'.`,
        );
    }

    picks.forEach((pick, index) => {
        const label = `Pick ${index + 1}`;
        if (pick.craneId !== state.crane.id || pick.craneId !== evaluation.craneId) {
            issues.push(
                `${label} belongs to crane '${String(pick.craneId)}' but the report selects '${state.crane.id}' and the evaluation is for '${String(evaluation.craneId)}'.`,
            );
        }
        if (pick.craneName !== state.crane.name || pick.craneName !== evaluation.craneName) {
            issues.push(
                `${label} names crane '${String(pick.craneName)}' but the report selects '${state.crane.name}' and the evaluation names '${String(evaluation.craneName)}'.`,
            );
        }
        if (!sameFiniteNumber(pick.jibM, state.jibM.value) || !sameFiniteNumber(pick.jibM, evaluation.jibM)) {
            issues.push(
                `${label} uses a ${String(pick.jibM)} m jib but the report displays ${state.jibM.value} m and the evaluation uses ${String(evaluation.jibM)} m.`,
            );
        }
        if (!isValidPickWind(pick.windKmh)) {
            issues.push(`${label} has an invalid wind value '${String(pick.windKmh)}'.`);
        }
    });

    const expectedFailedCount = picks.filter((pick) => pick.status !== "PASS").length;
    if (!Number.isInteger(evaluation.failedCount) || evaluation.failedCount < 0) {
        issues.push(
            `The pick evaluation failedCount '${String(evaluation.failedCount)}' is not a non-negative integer.`,
        );
    } else if (evaluation.failedCount !== expectedFailedCount) {
        issues.push(
            `The pick evaluation failedCount is ${evaluation.failedCount} but ${expectedFailedCount} pick row(s) are not PASS.`,
        );
    }

    const expectedAllPass = picks.length > 0 && expectedFailedCount === 0;
    if (typeof evaluation.allPass !== "boolean") {
        issues.push(`The pick evaluation allPass '${String(evaluation.allPass)}' is not a boolean.`);
    } else if (evaluation.allPass !== expectedAllPass) {
        issues.push(
            `The pick evaluation allPass is ${evaluation.allPass} but the pick rows ${
                expectedAllPass ? "all pass" : "do not all pass"
            }.`,
        );
    }

    return issues;
}

/**
 * Every evaluated result participates in the verdict. T8/T9 overall statuses
 * are included as well, so a malformed report cannot hide a failing row behind
 * an overall PASS. An absent or empty check set becomes NOT_CHECKED.
 */
function collectVerdictStatuses(
    state: TowerPlanState,
    picks: readonly TowerReportPick[],
    oversail: TowerReportOversail | null,
    height: TowerReportHeight | null,
    evaluationIssues: readonly string[],
): MetricStatus[] {
    const statuses: MetricStatus[] = [];

    // A report without usable site geometry cannot verify the T8 constraints,
    // so it cannot be an all-pass report. This is a deliberate T10 policy.
    if (!hasUsableSite(state.site)) {
        statuses.push("NOT_CHECKED");
    }
    if (evaluationIssues.length > 0) {
        statuses.push("INVALID");
    }

    if (picks.length === 0) {
        statuses.push("NOT_CHECKED");
    } else {
        statuses.push(...picks.map((pick) => pick.status));
    }

    if (!oversail) {
        statuses.push("NOT_CHECKED");
    } else {
        statuses.push(oversail.overallStatus);
        if (oversail.results.length === 0) {
            statuses.push("NOT_CHECKED");
        } else {
            statuses.push(...oversail.results.map((result) => result.status));
        }
    }

    if (!height) {
        statuses.push("NOT_CHECKED");
    } else {
        statuses.push(height.overallStatus);
        if (!height.valid || height.results.length === 0) {
            statuses.push("NOT_CHECKED");
        } else {
            statuses.push(...height.results.map((result) => result.status));
        }
    }

    return statuses;
}

interface SectionDisclosure {
    readonly checks: readonly TowerReportCheck[];
    readonly notChecked: readonly TowerReportNotChecked[];
}

function oversailDisclosure(oversail: TowerReportOversail | null): SectionDisclosure {
    if (!oversail) {
        return {
            checks: [],
            notChecked: [
                {
                    item: "Oversail checks (T8)",
                    reason: "No T8 oversail report was supplied.",
                },
            ],
        };
    }

    const checks: TowerReportCheck[] = [];
    for (const result of oversail.results) {
        if (result.status === "PASS") continue;
        checks.push({
            category: "oversail",
            id: result.id,
            label: result.label,
            status: result.status,
            message: result.message,
            requiredM: result.requiredM,
            availableM: result.availableM,
        });
    }

    const empty = oversail.results.length === 0;
    const notChecked: TowerReportNotChecked[] = [];
    if (empty) {
        notChecked.push({
            item: "Oversail checks (T8)",
            reason: "The T8 report contains no check results.",
        });
    }

    const overall = oversail.overallStatus;
    const rowCarriesOverall = oversail.results.some((result) => result.status === overall);
    if (overall !== "PASS" && (empty || !rowCarriesOverall)) {
        checks.push({
            category: "oversail",
            id: "oversail-overall",
            label: "Oversail checks (T8 overall)",
            status: overall,
            message: empty
                ? `The T8 report contains no check results and reports an overall status of ${overall}.`
                : `The T8 report reports an overall status of ${overall}, but no individual result carries that status.`,
        });
    }

    return { checks, notChecked };
}

function heightDisclosure(height: TowerReportHeight | null): SectionDisclosure {
    if (!height) {
        return {
            checks: [],
            notChecked: [
                {
                    item: "Height and tie-in checks (T9)",
                    reason: "No T9 height report was supplied.",
                },
            ],
        };
    }

    const checks: TowerReportCheck[] = [];
    for (const result of height.results) {
        if (result.status === "PASS") continue;
        checks.push({
            category: "height",
            id: result.id,
            label: result.label,
            status: result.status,
            message: result.message,
            requiredM: result.requiredM,
            availableM: result.availableM,
        });
    }

    const empty = height.results.length === 0;
    const notChecked: TowerReportNotChecked[] = [];
    const unavailable = !height.valid || height.overallStatus === "NOT_CHECKED";
    if (unavailable) {
        const reason = height.errors.join(" ") || "Height checks were not performed.";
        checks.push({
            category: "height",
            id: "height-unavailable",
            label: "Height and tie-in checks (T9)",
            status: "NOT_CHECKED",
            message: reason,
        });
        notChecked.push({
            item: "Height and tie-in checks (T9)",
            reason,
        });
    } else if (empty) {
        notChecked.push({
            item: "Height and tie-in checks (T9)",
            reason: "The T9 report contains no check results.",
        });
    }

    const overall = height.overallStatus;
    const rowCarriesOverall = height.results.some((result) => result.status === overall);
    const alreadyExplained = unavailable && overall === "NOT_CHECKED";
    if (overall !== "PASS" && !alreadyExplained && (empty || !rowCarriesOverall)) {
        checks.push({
            category: "height",
            id: "height-overall",
            label: "Height and tie-in checks (T9 overall)",
            status: overall,
            message: empty
                ? `The T9 report contains no check results and reports an overall status of ${overall}.`
                : `The T9 report reports an overall status of ${overall}, but no individual result carries that status.`,
        });
    }

    return { checks, notChecked };
}

function pickMessage(pick: TowerReportPick): string {
    const capacity =
        pick.capacityT === null ? "no published capacity" : `${pick.capacityT} t published capacity`;
    const issue = pick.issue ? ` Issue: ${pick.issue}.` : "";
    return `${pick.loadT} t at ${pick.radiusM} m; ${capacity}.${issue}`;
}

function buildFailedChecks(
    picks: readonly TowerReportPick[],
    evaluationIssues: readonly string[],
    oversail: SectionDisclosure,
    height: SectionDisclosure,
): TowerReportCheck[] {
    const checks: TowerReportCheck[] = [];

    if (evaluationIssues.length > 0) {
        checks.push({
            category: "pick",
            id: "pick-evaluation-metadata",
            label: "Pick evaluation metadata",
            status: "INVALID",
            message: evaluationIssues.join(" "),
        });
    }

    picks.forEach((pick, index) => {
        if (pick.status === "PASS") return;
        checks.push({
            category: "pick",
            id: `pick-${index + 1}`,
            label: pick.label || `Pick ${index + 1}`,
            status: pick.status,
            message: pickMessage(pick),
        });
    });

    checks.push(...oversail.checks, ...height.checks);
    return checks;
}

function buildNotChecked(
    state: TowerPlanState,
    picks: readonly TowerReportPick[],
    oversail: SectionDisclosure,
    height: SectionDisclosure,
): TowerReportNotChecked[] {
    const items: TowerReportNotChecked[] = [];

    if (!hasUsableSite(state.site)) {
        items.push({
            item: "Site model",
            reason: "No site model was supplied; the report cannot verify site constraints.",
        });
    }
    if (picks.length === 0) {
        items.push({
            item: "Pick capacity checks",
            reason: "No pick evaluations were supplied.",
        });
    }

    items.push(...oversail.notChecked, ...height.notChecked);

    // These are outside the current Tower implementation. They are always
    // disclosed so a PASS cannot be read as a foundation or 3D-clearance pass.
    items.push({
        item: "Pad reactions",
        reason: "Not implemented in the Tower Planner; foundation and pad reactions are not checked by this report.",
    });
    items.push({
        item: "General 3D minimum distance",
        reason: "Not implemented in the Tower Planner; T8 covers horizontal oversail and T9 covers height and tie-in only.",
    });

    return items;
}

function mapCatalogueNumber(
    item: string,
    value: CatalogueNumber | null | undefined,
    sources: TowerCrane["sources"] | null | undefined,
): TowerReportSource {
    if (isNotStated(value)) {
        return { item, status: "NOT_STATED", note: value.reason };
    }
    return mapSourcedNumber(item, value, sources);
}

function mapHeaviestErectionComponent(
    component: HeaviestErectionComponent,
    sources: TowerCrane["sources"] | null | undefined,
): TowerReportSource {
    if (isNotStated(component)) {
        return {
            item: "Heaviest erection component mass",
            status: "NOT_STATED",
            note: component.reason,
        };
    }
    return mapSourcedNumber("Heaviest erection component mass", component.massT, sources);
}

function buildSources(state: TowerPlanState, capacitySource: TowerReportSource): TowerReportSource[] {
    const sources: TowerReportSource[] = [];

    if (hasUsableSite(state.site)) {
        sources.push(mapSiteProvenance(state.siteProvenance));
    }

    sources.push(
        mapSourcedNumber("Crane maximum capacity", state.crane.maxCapacityT, state.crane.sources),
        mapSourcedNumber("Crane maximum jib length", state.crane.maxJibLengthM, state.crane.sources),
        mapCatalogueNumber("Mast width", state.crane.dimensions.mastWidthM, state.crane.sources),
        mapCatalogueNumber(
            "Counter-jib length",
            state.crane.dimensions.counterJibLengthM,
            state.crane.sources,
        ),
        mapHeaviestErectionComponent(state.crane.heaviestErectionComponent, state.crane.sources),
        mapSourcedNumber("Selected jib length", state.jibM, state.crane.sources),
        capacitySource,
        mapCraneDimension("Hook height (available)", state.heightParameters.hookHeight),
        mapCraneDimension("Hook clearance", state.heightParameters.hookClearance),
        mapCraneDimension("Freestanding height", state.heightParameters.freestandingHeight),
        mapCraneDimension("Tie-in spacing", state.heightParameters.tieInSpacing),
    );

    return sources;
}

function buildAssumptions(
    state: TowerPlanState,
    picks: readonly TowerReportPick[],
    evaluation: TowerPlanCraneEvaluation | undefined,
): ReportAssumption[] {
    const assumptions: ReportAssumption[] = (state.assumptions ?? []).map((assumption) => ({
        category: assumption.category,
        description: assumption.description,
    }));

    const craneWind = evaluation ? evaluation.windKmh : state.windKmh;
    const overrides = picks
        .map((pick, index) => ({ pick, index }))
        .filter(({ pick }) => isValidPickWind(pick.windKmh) && !sameWind(pick.windKmh, craneWind));

    if (state.windKmh !== null || overrides.length > 0) {
        assumptions.push({
            category: "operational",
            description: WIND_DERATE_RULE.note,
        });
    }
    if (overrides.length > 0) {
        const details = overrides
            .map(({ pick, index }) =>
                pick.windKmh === null
                    ? `Pick ${index + 1} disables the wind derate with a null wind override`
                    : `Pick ${index + 1} uses a ${String(pick.windKmh)} km/h wind override`,
            )
            .join("; ");
        assumptions.push({
            category: "operational",
            description: `${details}. The crane-level setting is ${
                state.windKmh === null ? "none" : `${String(state.windKmh)} km/h`
            }; a per-pick override is not the crane-level wind setting.`,
        });
    }

    return assumptions;
}

/**
 * Build a report snapshot from already-evaluated inputs. This function is pure:
 * it reads no DOM, viewport or clock, and it never re-runs capacity or T8/T9.
 */
export function buildTowerReportSnapshot(state: TowerPlanState): TowerReportSnapshot {
    const evaluation = state.craneEvaluation;
    const picks = (evaluation?.picks ?? []).map(mapPick);
    const oversail = mapOversail(state.oversailReport);
    const height = mapHeight(state.heightReport, state.heightParameters);
    const heightParameters = cloneHeightParameters(state.heightParameters);
    const site = hasUsableSite(state.site) ? cloneSite(state.site) : null;
    const evaluationIssues = findEvaluationIssues(state, evaluation, picks);
    const oversailSection = oversailDisclosure(oversail);
    const heightSection = heightDisclosure(height);
    // Only a pick with a supplied finite capacity is evidence that the capacity
    // engine actually used the chart for that radius. Picks with a null capacity
    // (invalid input, out of range, unsupported) must not be attributed a basis.
    const capacityRadiiM = picks.flatMap((pick) =>
        pick.capacityT !== null &&
        Number.isFinite(pick.capacityT) &&
        pick.radiusM !== null &&
        Number.isFinite(pick.radiusM)
            ? [pick.radiusM]
            : [],
    );
    const capacitySource = mapCapacityBasis(
        state.crane,
        state.jibM.value,
        picks.length === 0 ? undefined : capacityRadiiM,
    );

    return {
        metadata: {
            projectName: state.metadata.projectName,
            siteLocation: state.metadata.siteLocation,
            date: state.metadata.date,
            author: state.metadata.author,
        },
        site,
        siteSource: site ? mapSiteProvenance(state.siteProvenance) : null,

        crane: cloneCrane(state.crane),
        placement: {
            x: state.placement.x,
            y: state.placement.y,
            slewAngleDeg: state.placement.slewAngleDeg,
        },
        jibM: state.jibM.value,
        windKmh: state.windKmh,
        evaluation: mapEvaluation(evaluation),

        picks,
        oversail,
        height,
        heightParameters,

        verdict: verdictFromStatuses(
            collectVerdictStatuses(state, picks, oversail, height, evaluationIssues),
        ),
        failedChecks: buildFailedChecks(picks, evaluationIssues, oversailSection, heightSection),
        notChecked: buildNotChecked(state, picks, oversailSection, heightSection),

        sources: buildSources(state, capacitySource),
        assumptions: buildAssumptions(state, picks, evaluation),
        notes: [...(state.notes ?? [])],
    };
}
