// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type MetricStatus,
    type ReportData,
    type ReportMetric,
    type ReportSection,
    type ReportSource,
    type ReportTableColumn,
    type ReportTableRow,
    validateReportData,
} from "../../../site-model/src/report";
import type { HeightParameters } from "../model/heightTypes";
import type { CatalogueNumber, HeaviestErectionComponent, NotStated } from "../types";
import type {
    TowerReportHeight,
    TowerReportNotChecked,
    TowerReportOversail,
    TowerReportSnapshot,
    TowerReportSource,
} from "./towerReportTypes";

const REPORT_TITLE = "Tower Crane Lift Plan";
const VERDICT_TITLE = "Tower lift check";

/**
 * T10-1 always discloses these scope limitations, but they do not participate
 * in the verdict. They are kept separate from checks that were not performed.
 */
const ADVISORY_NOT_CHECKED_ITEMS: ReadonlySet<string> = new Set([
    "pad reactions",
    "general 3d minimum distance",
]);

interface StatusCounts {
    readonly passed: number;
    readonly failed: number;
    readonly unresolved: number;
    readonly notChecked: number;
}

interface NotCheckedCounts {
    /** Not-checked disclosures that already have a matching attention row. */
    readonly alreadyReported: number;
    /** Non-gating scope limitations. */
    readonly advisory: number;
    /** Additional not-checked items with no matching attention row. */
    readonly additional: number;
}

function countStatuses(statuses: readonly MetricStatus[]): StatusCounts {
    let passed = 0;
    let failed = 0;
    let unresolved = 0;
    let notChecked = 0;

    for (const status of statuses) {
        if (status === "PASS") {
            passed += 1;
        } else if (status === "FAIL") {
            failed += 1;
        } else if (status === "NOT_CHECKED") {
            notChecked += 1;
        } else {
            // WARN, INFO, OUT_OF_RANGE, INVALID and UNSUPPORTED are not a
            // verified pass and not a hard failure.
            unresolved += 1;
        }
    }

    return { passed, failed, unresolved, notChecked };
}

function plural(count: number): string {
    return count === 1 ? "" : "s";
}

function normalizeCheckLabel(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s*\(overall\)\s*$/, "");
}

function isAdvisoryNotChecked(entry: TowerReportNotChecked): boolean {
    return (
        ADVISORY_NOT_CHECKED_ITEMS.has(entry.item.trim().toLowerCase()) ||
        entry.reason.trim().toLowerCase().startsWith("not implemented in the tower planner")
    );
}

/**
 * A T9/T8 section that could not run is represented by both a NOT_CHECKED
 * attention row and a notChecked disclosure. Count the pair once, and keep
 * advisory scope limitations out of the performed-check counts.
 */
function countNotChecked(snapshot: TowerReportSnapshot): NotCheckedCounts {
    const reportedLabels = new Set(
        snapshot.failedChecks
            .filter((check) => check.status === "NOT_CHECKED")
            .map((check) => normalizeCheckLabel(check.label)),
    );

    let alreadyReported = 0;
    let advisory = 0;
    let additional = 0;

    for (const entry of snapshot.notChecked) {
        if (isAdvisoryNotChecked(entry)) {
            advisory += 1;
        } else if (reportedLabels.has(normalizeCheckLabel(entry.item))) {
            alreadyReported += 1;
        } else {
            additional += 1;
        }
    }

    return { alreadyReported, advisory, additional };
}

function buildInconsistencyNote(
    snapshot: TowerReportSnapshot,
    pickCounts: StatusCounts,
    checkCounts: StatusCounts,
    additionalNotChecked: number,
): string | null {
    const failedEvidence = pickCounts.failed + checkCounts.failed;

    if (snapshot.verdict === "PASS") {
        const nonPassEvidence =
            pickCounts.failed +
            pickCounts.unresolved +
            pickCounts.notChecked +
            checkCounts.failed +
            checkCounts.unresolved +
            checkCounts.notChecked +
            additionalNotChecked;

        if (nonPassEvidence > 0) {
            return `Evidence inconsistency: the supplied verdict is PASS, but the supplied evidence contains ${nonPassEvidence} non-pass pick/check row${plural(nonPassEvidence)}. The verdict is reproduced unchanged.`;
        }
    }

    if (snapshot.verdict === "FAIL" && failedEvidence === 0) {
        return "Evidence inconsistency: the supplied verdict is FAIL, but the supplied evidence contains no failed pick or check row. The verdict is reproduced unchanged.";
    }

    return null;
}

/**
 * The summary is built only from the supplied counters and statuses. It never
 * derives a new verdict; `snapshot.verdict` remains authoritative. A single
 * unavailable check is not counted as both an attention row and a separate
 * not-checked check, and advisory scope limitations are reported separately.
 */
function buildVerdictSummary(snapshot: TowerReportSnapshot): string {
    const pickCounts = countStatuses(snapshot.picks.map((pick) => pick.status));
    const checkCounts = countStatuses(snapshot.failedChecks.map((check) => check.status));
    const notChecked = countNotChecked(snapshot);
    const notPerformed = checkCounts.notChecked + notChecked.additional;

    const parts = [
        `${snapshot.picks.length} pick check${plural(snapshot.picks.length)}: ${pickCounts.passed} passed, ${pickCounts.failed} failed, ${pickCounts.unresolved} unresolved, ${pickCounts.notChecked} not checked.`,
        `Checks requiring attention (${snapshot.failedChecks.length} row${plural(snapshot.failedChecks.length)}): ${checkCounts.failed} failed, ${checkCounts.unresolved} unresolved, ${checkCounts.notChecked} not checked.`,
        `Checks not performed: ${notPerformed}.`,
    ];

    if (notChecked.alreadyReported > 0) {
        parts.push(
            `Already included in the attention rows: ${notChecked.alreadyReported} check${plural(notChecked.alreadyReported)}.`,
        );
    }
    if (notChecked.advisory > 0) {
        parts.push(`Advisory limitations (not part of the evaluated check counts): ${notChecked.advisory}.`);
    }

    const inconsistency = buildInconsistencyNote(snapshot, pickCounts, checkCounts, notChecked.additional);
    if (inconsistency !== null) {
        parts.push(inconsistency);
    }

    parts.push(
        `Overall verdict: ${snapshot.verdict}. This verdict is reproduced from the snapshot and is not recalculated.`,
    );

    return parts.join(" ");
}

function hasText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/** Only a real, non-blank document may enter S7's required `document` field. */
function hasSourceDocument(
    source: TowerReportSource,
): source is TowerReportSource & { readonly document: string } {
    return hasText(source.document);
}

function isNotStated(value: CatalogueNumber | HeaviestErectionComponent): value is NotStated {
    return "kind" in value && value.kind === "notStated";
}

function catalogueMetric(label: string, value: CatalogueNumber, unit: string): ReportMetric {
    return isNotStated(value)
        ? { label, value: null, unit, notes: value.reason }
        : { label, value: value.value, unit };
}

/**
 * Slew is not part of a Pick Check evaluation. When it is absent, show an
 * explicit not-evaluated disclosure rather than a numeric zero or a status.
 */
function slewMetric(slewAngleDeg: number | undefined): ReportMetric {
    if (typeof slewAngleDeg === "number" && Number.isFinite(slewAngleDeg)) {
        return { label: "Slew angle", value: slewAngleDeg, unit: "°" };
    }
    return {
        label: "Slew angle",
        value: null,
        notes: "Not evaluated: no slew angle was supplied for this report. No default or numeric value is inferred.",
    };
}

function buildCraneSection(snapshot: TowerReportSnapshot): ReportSection {
    const crane = snapshot.crane;
    const metrics: ReportMetric[] = [
        { label: "Crane", value: crane.name },
        { label: "Model", value: crane.modelName },
        { label: "Configuration", value: crane.configuration },
        { label: "Standard", value: crane.standard },
        { label: "Crane type", value: crane.craneType },
        { label: "Selected jib length", value: snapshot.jibM, unit: "m" },
        { label: "Wind speed", value: snapshot.windKmh, unit: "km/h" },
        { label: "Mast position X", value: snapshot.placement.x, unit: "m" },
        { label: "Mast position Y", value: snapshot.placement.y, unit: "m" },
        slewMetric(snapshot.placement.slewAngleDeg),
        { label: "Evaluated crane", value: snapshot.evaluation.craneName },
        { label: "Evaluated jib length", value: snapshot.evaluation.jibM, unit: "m" },
        { label: "Evaluated wind speed", value: snapshot.evaluation.windKmh, unit: "km/h" },
        { label: "Picks evaluated", value: snapshot.picks.length },
        { label: "Failed picks (supplied evaluation)", value: snapshot.evaluation.failedCount },
        { label: "Maximum capacity", value: crane.maxCapacityT.value, unit: "t" },
        { label: "Catalogue default jib length", value: crane.defaultJibM.value, unit: "m" },
        { label: "Maximum jib length", value: crane.maxJibLengthM.value, unit: "m" },
        catalogueMetric("Height under hook", crane.heightUnderHookM, "m"),
        catalogueMetric("Catalogue freestanding height", crane.freestandingHeightM, "m"),
        catalogueMetric("Mast width", crane.dimensions.mastWidthM, "m"),
        catalogueMetric("Base width", crane.dimensions.baseWidthM, "m"),
        catalogueMetric("Counter-jib length", crane.dimensions.counterJibLengthM, "m"),
        catalogueMetric("Counter-jib radius", crane.dimensions.counterJibRadiusM, "m"),
    ];

    const component = crane.heaviestErectionComponent;
    if (isNotStated(component)) {
        metrics.push({
            label: "Heaviest erection component",
            value: null,
            notes: component.reason,
        });
    } else {
        metrics.push({ label: "Heaviest erection component", value: component.name });
        metrics.push({
            label: "Heaviest erection component mass",
            value: component.massT.value,
            unit: "t",
            notes: component.note,
        });
    }

    const transportPackage = crane.combinedTransportPackage;
    if (transportPackage !== undefined) {
        metrics.push({ label: "Combined transport package", value: transportPackage.name });
        metrics.push({
            label: "Combined transport package mass",
            value: transportPackage.massT.value,
            unit: "t",
            notes: transportPackage.note,
        });
    } else {
        metrics.push({
            label: "Combined transport package",
            value: null,
            notes: "No combined transport package is recorded in the catalogue entry.",
        });
    }

    return {
        id: "crane-configuration",
        title: "Crane & configuration",
        description:
            "The selected crane, its supplied catalogue values and the settings used for pick evaluation. Values are copied from the snapshot and are not recalculated.",
        metrics,
    };
}

const PICK_COLUMNS: readonly ReportTableColumn[] = [
    { key: "pick", header: "Pick" },
    { key: "loadT", header: "Load", unit: "t", align: "right" },
    { key: "supplyRadiusM", header: "Supply radius", unit: "m", align: "right" },
    { key: "dropRadiusM", header: "Drop radius", unit: "m", align: "right" },
    { key: "radiusM", header: "Governing radius", unit: "m", align: "right" },
    { key: "capacityT", header: "Capacity", unit: "t", align: "right" },
    { key: "utilisationPct", header: "Utilisation", unit: "%", align: "right" },
    { key: "issue", header: "Issue" },
];

function buildPicksSection(snapshot: TowerReportSnapshot): ReportSection {
    const rows: readonly ReportTableRow[] = snapshot.picks.map((pick) => ({
        cells: {
            pick: pick.label,
            loadT: pick.loadT,
            supplyRadiusM: pick.supplyRadiusM ?? null,
            dropRadiusM: pick.dropRadiusM ?? null,
            radiusM: pick.radiusM,
            capacityT: pick.capacityT,
            utilisationPct: pick.utilisationPct,
            issue: pick.issue ?? null,
        },
        status: pick.status,
    }));

    const base: ReportSection = {
        id: "picks",
        title: "Picks",
        description:
            rows.length === 0
                ? "No pick results were supplied."
                : "One row per evaluated pick. A missing number is shown as —; it is not zero.",
    };

    return rows.length === 0 ? base : { ...base, columns: PICK_COLUMNS, rows };
}

function buildAttentionSection(snapshot: TowerReportSnapshot): ReportSection {
    const rows: readonly ReportTableRow[] = snapshot.failedChecks.map((check) => ({
        cells: {
            category: check.category,
            check: check.label,
            message: check.message,
            requiredM: check.requiredM ?? null,
            availableM: check.availableM ?? null,
        },
        status: check.status,
    }));

    const base: ReportSection = {
        id: "checks-attention",
        title: "Checks requiring attention",
        description:
            rows.length === 0
                ? "No failed or unresolved checks were recorded."
                : "Every supplied check that did not pass, with its original status and message.",
    };

    return rows.length === 0
        ? base
        : {
              ...base,
              columns: [
                  { key: "category", header: "Category" },
                  { key: "check", header: "Check" },
                  { key: "message", header: "Message" },
                  { key: "requiredM", header: "Required", unit: "m", align: "right" },
                  { key: "availableM", header: "Available", unit: "m", align: "right" },
              ],
              rows,
          };
}

function buildNotCheckedSection(snapshot: TowerReportSnapshot): ReportSection {
    const rows: readonly ReportTableRow[] = snapshot.notChecked.map((entry) => ({
        cells: {
            item: entry.item,
            reason: entry.reason,
        },
    }));

    const base: ReportSection = {
        id: "checks-not-performed",
        title: "Checks not performed",
        description:
            rows.length === 0
                ? "No unperformed checks were recorded."
                : "Checks that were not performed are listed here so a PASS is not read as a fully checked result.",
    };

    return rows.length === 0
        ? base
        : {
              ...base,
              columns: [
                  { key: "item", header: "Item" },
                  { key: "reason", header: "Reason" },
              ],
              rows,
          };
}

function buildOversailSection(oversail: TowerReportOversail): ReportSection {
    const rows: readonly ReportTableRow[] = oversail.results.map((result) => ({
        cells: {
            check: result.label,
            kind: result.kind,
            depthM: result.oversailDepthM,
            requiredM: result.requiredM ?? null,
            availableM: result.availableM ?? null,
            message: result.message,
            source: result.source ?? null,
        },
        status: result.status,
    }));

    const base: ReportSection = {
        id: "oversail-checks",
        title: "Oversail checks",
        description:
            rows.length === 0
                ? "The T8 report contains no check result rows."
                : "Oversail results supplied by T8, including source strings exactly as recorded.",
        metrics: [
            {
                label: "Overall T8 result",
                value: oversail.overallStatus,
                status: oversail.overallStatus,
            },
        ],
    };

    return rows.length === 0
        ? base
        : {
              ...base,
              columns: [
                  { key: "check", header: "Check" },
                  { key: "kind", header: "Kind" },
                  { key: "depthM", header: "Oversail depth", unit: "m", align: "right" },
                  { key: "requiredM", header: "Required", unit: "m", align: "right" },
                  { key: "availableM", header: "Available", unit: "m", align: "right" },
                  { key: "message", header: "Message" },
                  { key: "source", header: "Source" },
              ],
              rows,
          };
}

function plannedHeightMetrics(parameters: HeightParameters): ReportMetric[] {
    return [
        { label: "Hook height", value: parameters.hookHeight.value, unit: "m" },
        { label: "Hook clearance", value: parameters.hookClearance.value, unit: "m" },
        { label: "Freestanding height", value: parameters.freestandingHeight.value, unit: "m" },
        { label: "Tie-in spacing", value: parameters.tieInSpacing.value, unit: "m" },
    ];
}

function buildHeightSection(
    height: TowerReportHeight | null,
    plannedParameters: HeightParameters | undefined,
): ReportSection {
    if (!height) {
        if (!plannedParameters) {
            return {
                id: "height-tie-in",
                title: "Height and tie-in",
                description:
                    "No T9 height report was supplied and no planned height parameters were recorded. No height or tie-in check result is implied.",
            };
        }
        return {
            id: "height-tie-in",
            title: "Height and tie-in",
            description:
                "No T9 height report was supplied. The planned height parameters are shown for reference; no height or tie-in check result is implied.",
            metrics: plannedHeightMetrics(plannedParameters),
        };
    }

    const metrics: ReportMetric[] = [
        {
            label: "Overall T9 result",
            value: height.overallStatus,
            status: height.overallStatus,
        },
        { label: "T9 report valid", value: height.valid ? "Yes" : "No" },
    ];

    const planned = height.parameters ?? plannedParameters;
    if (planned) {
        metrics.push(...plannedHeightMetrics(planned));
    } else {
        metrics.push({
            label: "Planned height parameters",
            value: null,
            notes: "A T9 height report was supplied without planned height parameters; planned-height values are not shown.",
        });
    }

    if (height.requiredHookHeightM !== undefined) {
        metrics.push({ label: "Required hook height", value: height.requiredHookHeightM, unit: "m" });
    }
    if (height.providedHookHeightM !== undefined) {
        metrics.push({ label: "Provided hook height", value: height.providedHookHeightM, unit: "m" });
    }
    if (height.controllingBuilding !== undefined) {
        metrics.push({ label: "Controlling building", value: height.controllingBuilding.label });
    }

    const buildingHeightM = height.buildingHeightM ?? height.controllingBuilding?.heightM;
    if (buildingHeightM !== undefined) {
        metrics.push({ label: "Controlling building height", value: buildingHeightM, unit: "m" });
    }
    if (height.freestandingHeightM !== undefined) {
        metrics.push({
            label: "Freestanding height (T9 input)",
            value: height.freestandingHeightM,
            unit: "m",
        });
    }

    metrics.push({ label: "Tie-in required", value: height.tieInRequired ? "Yes" : "No" });
    if (height.tieInLevelsM.length > 0) {
        metrics.push({
            label: "Tie-in levels",
            value: height.tieInLevelsM.join(", "),
            unit: "m",
        });
    } else {
        metrics.push({
            label: "Tie-in levels",
            value: null,
            notes: height.tieInRequired
                ? "Tie-in is required, but no tie-in levels were supplied."
                : "No tie-in levels were supplied.",
        });
    }

    if (height.errors.length > 0) {
        metrics.push({ label: "T9 input errors", value: height.errors.join("; ") });
    }

    const rows: readonly ReportTableRow[] = height.results.map((result) => ({
        cells: {
            check: result.label,
            kind: result.kind,
            requiredM: result.requiredM ?? null,
            availableM: result.availableM ?? null,
            message: result.message,
        },
        status: result.status,
    }));

    const missingParametersNote = planned
        ? ""
        : " The T9 report was supplied without planned height parameters; planned-height values are not shown.";

    const base: ReportSection = {
        id: "height-tie-in",
        title: "Height and tie-in",
        description: `${
            rows.length === 0
                ? "The T9 report contains no check result rows."
                : "Height and tie-in results supplied by T9. The overall status and every row status are preserved."
        }${missingParametersNote}`,
        metrics,
    };

    return rows.length === 0
        ? base
        : {
              ...base,
              columns: [
                  { key: "check", header: "Check" },
                  { key: "kind", header: "Kind" },
                  { key: "requiredM", header: "Required", unit: "m", align: "right" },
                  { key: "availableM", header: "Available", unit: "m", align: "right" },
                  { key: "message", header: "Message" },
              ],
              rows,
          };
}

function formatPoint(point: { readonly x: number; readonly y: number }): string {
    return `(${point.x}, ${point.y})`;
}

function formatPolygon(polygon: readonly { readonly x: number; readonly y: number }[]): string {
    return polygon.length === 0 ? "No vertices supplied" : polygon.map(formatPoint).join(" → ");
}

function buildSiteSections(snapshot: TowerReportSnapshot): ReportSection[] {
    const site = snapshot.site;
    if (!site) return [];

    const road = site.road;
    const powerLine = site.powerLine;
    const buildings = site.buildings ?? [];

    const summary: ReportSection = {
        id: "site-summary",
        title: "Site summary",
        description:
            "Site geometry supplied to T8. Feature details are reproduced here so the site constraints do not depend on T8 having run. This section does not re-run a check.",
        metrics: [
            {
                label: "Boundary source",
                value: hasText(site.boundary.source) ? site.boundary.source : null,
                notes: hasText(site.boundary.source) ? undefined : "No boundary source was supplied.",
            },
            { label: "Boundary points", value: site.boundary.polygon.length },
            { label: "Neighbours", value: site.neighbours.length },
            { label: "No-go zones", value: site.noGoZones.length },
            {
                label: "Buildings",
                value: site.buildings ? buildings.length : null,
                notes: site.buildings ? undefined : "No building list was supplied.",
            },
            {
                label: "Road",
                value: road ? `${road.yFromM} to ${road.yToM} m (${road.rule})` : null,
                notes: road ? undefined : "No road constraint was supplied.",
            },
            { label: "Road source", value: road?.source ?? null },
            {
                label: "Power line",
                value: powerLine ? `x = ${powerLine.xM} m, clearance ${powerLine.clearanceM} m` : null,
                notes: powerLine ? undefined : "No power line was supplied.",
            },
            { label: "Power line voltage", value: powerLine?.voltageKv ?? null, unit: "kV" },
            { label: "Power line source", value: powerLine?.sourceNote ?? null },
            {
                label: "Power line attribution",
                value: powerLine ? (powerLine.indicative ? "INDICATIVE" : "Not marked INDICATIVE") : null,
            },
        ],
    };

    const boundaryRows: readonly ReportTableRow[] = site.boundary.polygon.map((point, index) => ({
        cells: {
            point: `P${index + 1}`,
            x: point.x,
            y: point.y,
        },
    }));
    const boundary: ReportSection = {
        id: "site-boundary",
        title: "Site boundary",
        description:
            boundaryRows.length === 0
                ? "The site boundary polygon has no supplied vertices."
                : "Boundary polygon vertices supplied to T8, in metres.",
        ...(boundaryRows.length > 0
            ? {
                  columns: [
                      { key: "point", header: "Point" },
                      { key: "x", header: "X", unit: "m", align: "right" as const },
                      { key: "y", header: "Y", unit: "m", align: "right" as const },
                  ],
                  rows: boundaryRows,
              }
            : {}),
    };

    const neighbourRows: readonly ReportTableRow[] = site.neighbours.map((neighbour) => ({
        cells: {
            id: neighbour.id,
            neighbour: neighbour.label,
            displayName: neighbour.displayName,
            rule: neighbour.rule,
            points: neighbour.polygon.length,
            polygon: formatPolygon(neighbour.polygon),
        },
    }));
    const neighbours: ReportSection = {
        id: "site-neighbours",
        title: "Site neighbours",
        description:
            neighbourRows.length === 0
                ? "No neighbour features were supplied."
                : "Neighbour labels, rules and polygon details supplied to T8.",
        ...(neighbourRows.length > 0
            ? {
                  columns: [
                      { key: "id", header: "ID" },
                      { key: "neighbour", header: "Neighbour" },
                      { key: "displayName", header: "Display name" },
                      { key: "rule", header: "Rule" },
                      { key: "points", header: "Points", align: "right" as const },
                      { key: "polygon", header: "Polygon coordinates (m)" },
                  ],
                  rows: neighbourRows,
              }
            : {}),
    };

    const noGoRows: readonly ReportTableRow[] = site.noGoZones.map((zone) => ({
        cells: {
            label: zone.label,
            center: formatPoint(zone.center),
            radiusM: zone.radiusM,
        },
    }));
    const noGoZones: ReportSection = {
        id: "site-no-go-zones",
        title: "Site no-go zones",
        description:
            noGoRows.length === 0
                ? "No no-go zones were supplied."
                : "No-go zone labels, centres and radii supplied to T8.",
        ...(noGoRows.length > 0
            ? {
                  columns: [
                      { key: "label", header: "No-go zone" },
                      { key: "center", header: "Centre (m)" },
                      { key: "radiusM", header: "Radius", unit: "m", align: "right" as const },
                  ],
                  rows: noGoRows,
              }
            : {}),
    };

    const buildingRows: readonly ReportTableRow[] = buildings.map((building) => ({
        cells: {
            label: building.label,
            heightM: building.heightM ?? null,
        },
    }));
    const buildingSection: ReportSection = {
        id: "site-buildings",
        title: "Site buildings",
        description:
            buildingRows.length === 0
                ? "No building features were supplied."
                : "Building labels and heights supplied to T9. A missing height is shown as —; it is not zero.",
        ...(buildingRows.length > 0
            ? {
                  columns: [
                      { key: "label", header: "Building" },
                      { key: "heightM", header: "Height", unit: "m", align: "right" as const },
                  ],
                  rows: buildingRows,
              }
            : {}),
    };

    return [summary, boundary, neighbours, noGoZones, buildingSection];
}

/**
 * S7's `ReportSource` has no note field, so a source note is kept in a table
 * section instead of being dropped. Entries without a document always appear
 * here; documented entries appear only when they carry extra basis/note text.
 */
function buildSourceNotesSection(sources: readonly TowerReportSource[]): ReportSection | null {
    const notes = sources.filter(
        (source) => !hasSourceDocument(source) || hasText(source.basis) || hasText(source.note),
    );
    if (notes.length === 0) return null;

    const rows: readonly ReportTableRow[] = notes.map((source) => ({
        cells: {
            item: source.item,
            status: source.status,
            document: source.document ?? null,
            page: source.page ?? null,
            basis: source.basis ?? null,
            note: source.note ?? null,
        },
    }));

    return {
        id: "source-notes",
        title: "Source notes",
        description:
            "Source attribution notes, including entries without a document. No document, page or status is inferred.",
        columns: [
            { key: "item", header: "Item" },
            { key: "status", header: "Status" },
            { key: "document", header: "Document" },
            { key: "page", header: "Page", align: "right" },
            { key: "basis", header: "Basis" },
            { key: "note", header: "Note" },
        ],
        rows,
    };
}

function buildSources(snapshot: TowerReportSnapshot): readonly ReportSource[] {
    return snapshot.sources.filter(hasSourceDocument).map((source) => ({
        item: source.item,
        document: source.document,
        ...(source.page !== undefined ? { page: source.page } : {}),
        status: source.status,
    }));
}

/**
 * Pure and deterministic mapping from an already-evaluated T10 snapshot to the
 * shared S7 `ReportData` contract. It does not read the DOM, viewport or clock,
 * does not recalculate capacity/T8/T9, and never changes a supplied status.
 * S7 validation runs before the data is returned so invalid metadata cannot
 * leave the adapter.
 */
export function buildTowerReportData(snapshot: TowerReportSnapshot): ReportData {
    const siteLocation = snapshot.metadata.siteLocation?.trim();
    const sections: ReportSection[] = [
        buildCraneSection(snapshot),
        buildPicksSection(snapshot),
        buildAttentionSection(snapshot),
        buildNotCheckedSection(snapshot),
    ];

    if (snapshot.oversail) {
        sections.push(buildOversailSection(snapshot.oversail));
    }
    sections.push(buildHeightSection(snapshot.height, snapshot.heightParameters));
    sections.push(...buildSiteSections(snapshot));

    const sourceNotesSection = buildSourceNotesSection(snapshot.sources);
    if (sourceNotesSection !== null) {
        sections.push(sourceNotesSection);
    }

    const data: ReportData = {
        metadata: {
            title: REPORT_TITLE,
            projectName: snapshot.metadata.projectName,
            ...(siteLocation ? { siteLocation } : {}),
            date: snapshot.metadata.date,
            author: snapshot.metadata.author,
            product: "tower-planner",
        },
        verdict: {
            status: snapshot.verdict,
            title: VERDICT_TITLE,
            summary: buildVerdictSummary(snapshot),
        },
        sections,
        sources: buildSources(snapshot),
        assumptions: snapshot.assumptions.map((assumption) => ({
            category: assumption.category,
            description: assumption.description,
        })),
        notes: [...snapshot.notes],
    };

    validateReportData(data);
    return data;
}
