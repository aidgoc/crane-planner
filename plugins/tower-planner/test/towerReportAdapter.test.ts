// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import {
    generateReportHtml,
    METRIC_STATUSES,
    type MetricStatus,
    type ReportData,
    type ReportTableRow,
    type VerdictStatus,
    validateReportData,
} from "../../site-model/src/report";
import { REQUIRED_DISCLAIMER } from "../../site-model/src/types";
import { MCT88 } from "../src/catalogue";
import type { CraneDimension } from "../src/model/cranePlacement";
import { createDefaultHeightParameters } from "../src/model/heightChecks";
import type { HeightParameters } from "../src/model/heightTypes";
import type { OversailSite } from "../src/model/oversailTypes";
import { buildTowerReportData } from "../src/report/towerReportAdapter";
import type {
    TowerReportHeight,
    TowerReportOversail,
    TowerReportPick,
    TowerReportSnapshot,
    TowerReportSource,
} from "../src/report/towerReportTypes";

/*
 * HAND-WORKED ADAPTER CASE (the pick numbers are test fixtures, not catalogue values):
 *
 * P1: 2 t load / 5 t capacity = 40% -> PASS
 * P2: 6 t load / 5 t capacity = 120% -> FAIL
 * T9 tie-in check did not run -> NOT_CHECKED.
 *
 * Overall verdict: FAIL (a hard failure wins over the incomplete T9 check).
 * The T9 reason must remain visible so the FAIL report does not hide the
 * check that never ran.
 */

function rect(x1: number, y1: number, x2: number, y2: number) {
    return [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
    ];
}

function dimension(value: number): CraneDimension {
    return { value, source: { kind: "indicative", note: "Test fixture value." } };
}

function makeHeightParameters(overrides: Partial<Record<keyof HeightParameters, number>> = {}) {
    return {
        hookHeight: dimension(overrides.hookHeight ?? 80),
        hookClearance: dimension(overrides.hookClearance ?? 2),
        freestandingHeight: dimension(overrides.freestandingHeight ?? 50),
        tieInSpacing: dimension(overrides.tieInSpacing ?? 20),
    };
}

const SITE: OversailSite = {
    boundary: { polygon: rect(-100, -100, 100, 100), source: "Synthetic test site boundary" },
    neighbours: [],
    noGoZones: [],
    buildings: [],
};

const VERIFIED_SOURCE: TowerReportSource = {
    item: "Capacity basis",
    status: "VERIFIED",
    document: MCT88.sources.datasheetLoadCharts.document,
    page: MCT88.sources.datasheetLoadCharts.page,
};

const METADATA = {
    projectName: "T10 Adapter Test",
    siteLocation: "Test Site",
    date: "2026-11-13",
    author: "Test Engineer",
};

function reportPick(overrides: Partial<TowerReportPick> = {}): TowerReportPick {
    return {
        craneId: MCT88.id,
        craneName: MCT88.name,
        label: "P1",
        jibM: MCT88.defaultJibM.value,
        loadT: 1,
        radiusM: 20,
        supplyRadiusM: 20,
        dropRadiusM: 20,
        governing: "supply",
        windKmh: null,
        capacityT: 5,
        utilisationPct: 20,
        status: "PASS",
        ...overrides,
    };
}

function passingOversail(): TowerReportOversail {
    return {
        overallStatus: "PASS",
        results: [
            {
                id: "boundary",
                kind: "boundary",
                label: "Site boundary",
                status: "PASS",
                oversailDepthM: 0,
                message: "No oversail of the site boundary.",
                source: "Synthetic test site boundary",
            },
        ],
    };
}

function passingHeight(): TowerReportHeight {
    return {
        valid: true,
        errors: [],
        results: [
            {
                id: "hook_height",
                kind: "hook_height",
                label: "Hook height",
                status: "PASS",
                message: "Hook height OK.",
                requiredM: 60,
                availableM: 80,
            },
        ],
        overallStatus: "PASS",
        tieInRequired: false,
        tieInLevelsM: [],
        parameters: createDefaultHeightParameters(),
    };
}

function baseSnapshot(overrides: Partial<TowerReportSnapshot> = {}): TowerReportSnapshot {
    return {
        metadata: METADATA,
        site: SITE,
        siteSource: { item: "Site model", status: "LEGACY", note: "Synthetic test site boundary" },
        crane: MCT88,
        placement: { x: 30, y: 40, slewAngleDeg: 0 },
        jibM: MCT88.defaultJibM.value,
        windKmh: null,
        evaluation: {
            craneId: MCT88.id,
            craneName: MCT88.name,
            jibM: MCT88.defaultJibM.value,
            windKmh: null,
            allPass: true,
            failedCount: 0,
        },
        picks: [reportPick()],
        oversail: passingOversail(),
        height: passingHeight(),
        heightParameters: createDefaultHeightParameters(),
        verdict: "PASS",
        failedChecks: [],
        notChecked: [],
        sources: [VERIFIED_SOURCE],
        assumptions: [{ category: "general", description: "Test assumption." }],
        notes: ["Test note."],
        ...overrides,
    };
}

function snapshotForVerdict(verdict: VerdictStatus): TowerReportSnapshot {
    if (verdict === "PASS") return baseSnapshot();

    if (verdict === "FAIL") {
        const failingPick = reportPick({ label: "P2", status: "FAIL" });
        return baseSnapshot({
            verdict,
            picks: [reportPick(), failingPick],
            evaluation: { ...baseSnapshot().evaluation, allPass: false, failedCount: 1 },
            failedChecks: [
                {
                    category: "pick",
                    id: "pick-2",
                    label: "P2",
                    status: "FAIL",
                    message: "Utilisation exceeds 100%.",
                },
            ],
        });
    }

    if (verdict === "WARN") {
        const warning = {
            id: "neighbour:school",
            kind: "neighbour" as const,
            label: "Neighbour - school",
            status: "WARN" as const,
            oversailDepthM: 2,
            message: "Permission required from the school.",
        };
        return baseSnapshot({
            verdict,
            oversail: { overallStatus: "WARN", results: [warning] },
            failedChecks: [
                {
                    category: "oversail",
                    id: warning.id,
                    label: warning.label,
                    status: warning.status,
                    message: warning.message,
                },
            ],
        });
    }

    return baseSnapshot({
        verdict,
        notChecked: [{ item: "Pad reactions", reason: "Not implemented in the Tower Planner." }],
    });
}

function sectionById(data: ReportData, id: string) {
    const section = data.sections.find((item) => item.id === id);
    if (!section) throw new Error(`missing report section: ${id}`);
    return section;
}

function rowsById(data: ReportData, id: string): readonly ReportTableRow[] {
    return sectionById(data, id).rows ?? [];
}

function rowByItem(data: ReportData, id: string, item: string): ReportTableRow {
    const row = rowsById(data, id).find((entry) => entry.cells.item === item);
    if (!row) throw new Error(`missing row for ${item}`);
    return row;
}

function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) {
            deepFreeze((value as unknown as Record<string, unknown>)[key]);
        }
    }
    return value;
}

describe("T10-2 tower report S7 adapter", () => {
    test("maps metadata to the S7 contract without inventing values", () => {
        const data = buildTowerReportData(baseSnapshot());

        expect(data.metadata).toEqual({
            title: "Tower Crane Lift Plan",
            projectName: "T10 Adapter Test",
            siteLocation: "Test Site",
            date: "2026-11-13",
            author: "Test Engineer",
            product: "tower-planner",
        });
        expect(data.planView).toBeUndefined();
    });

    test("omits a blank optional site location", () => {
        const data = buildTowerReportData(baseSnapshot({ metadata: { ...METADATA, siteLocation: "   " } }));

        expect(data.metadata.siteLocation).toBeUndefined();
    });

    test.each([
        ["blank project name", { ...METADATA, projectName: "   " }, "projectName"],
        ["blank author", { ...METADATA, author: " " }, "author"],
        ["malformed date", { ...METADATA, date: "14/11/2026" }, "YYYY-MM-DD"],
        ["impossible calendar date", { ...METADATA, date: "2026-02-30" }, "YYYY-MM-DD"],
    ])("rejects %s at the adapter boundary", (_label, metadata, expectedMessage) => {
        expect(() => buildTowerReportData(baseSnapshot({ metadata }))).toThrow(RangeError);
        expect(() => buildTowerReportData(baseSnapshot({ metadata }))).toThrow(expectedMessage);
    });

    test.each([
        "PASS",
        "FAIL",
        "WARN",
        "INCOMPLETE",
    ] as const)("preserves the %s verdict exactly", (verdict) => {
        const data = buildTowerReportData(snapshotForVerdict(verdict));
        const summary = data.verdict?.summary ?? "";

        expect(data.verdict?.status).toBe(verdict);
        expect(data.verdict?.title).toBe("Tower lift check");
        expect(summary).toContain(`Overall verdict: ${verdict}.`);
        if (verdict === "FAIL") expect(summary).toContain("1 failed");
        if (verdict === "PASS") expect(summary).toContain("0 failed");
        if (verdict === "WARN") expect(summary).toContain("1 unresolved");
        if (verdict === "INCOMPLETE") {
            expect(summary).toContain("Checks not performed: 0.");
            expect(summary).toContain("Advisory limitations (not part of the evaluated check counts): 1.");
        }
    });

    test("summarises passed, failed, unresolved and not-checked counts truthfully", () => {
        const data = buildTowerReportData(
            baseSnapshot({
                verdict: "FAIL",
                picks: [
                    reportPick({ label: "P1" }),
                    reportPick({ label: "P2", status: "FAIL" }),
                    reportPick({ label: "P3", status: "OUT_OF_RANGE" }),
                ],
                failedChecks: [
                    {
                        category: "pick",
                        id: "pick-2",
                        label: "P2",
                        status: "FAIL",
                        message: "Utilisation exceeds 100%.",
                    },
                    {
                        category: "height",
                        id: "height-1",
                        label: "Hook height",
                        status: "NOT_CHECKED",
                        message: "No building heights were supplied.",
                    },
                ],
                notChecked: [
                    { item: "Pad reactions", reason: "Not implemented." },
                    { item: "General 3D minimum distance", reason: "Not implemented." },
                ],
            }),
        );

        const summary = data.verdict?.summary ?? "";
        expect(summary).toContain("3 pick checks: 1 passed, 1 failed, 1 unresolved, 0 not checked.");
        expect(summary).toContain(
            "Checks requiring attention (2 rows): 1 failed, 0 unresolved, 1 not checked.",
        );
        expect(summary).toContain("Checks not performed: 1.");
        expect(summary).toContain("Advisory limitations (not part of the evaluated check counts): 2.");
        expect(summary).not.toContain("Checks not performed: 3.");
        expect(data.verdict?.status).toBe("FAIL");
    });

    test("does not double count an unavailable T9 check and separates advisory limitations", () => {
        const data = buildTowerReportData(
            baseSnapshot({
                verdict: "INCOMPLETE",
                height: null,
                failedChecks: [
                    {
                        category: "height",
                        id: "height-unavailable",
                        label: "Height and tie-in checks (T9)",
                        status: "NOT_CHECKED",
                        message: "No T9 height report was supplied.",
                    },
                ],
                notChecked: [
                    {
                        item: "Height and tie-in checks (T9)",
                        reason: "No T9 height report was supplied.",
                    },
                    {
                        item: "Pad reactions",
                        reason: "Not implemented in the Tower Planner; foundation checks are not performed.",
                    },
                    {
                        item: "General 3D minimum distance",
                        reason: "Not implemented in the Tower Planner; general clearance is not checked.",
                    },
                ],
            }),
        );

        const summary = data.verdict?.summary ?? "";
        expect(summary).toContain("Checks not performed: 1.");
        expect(summary).toContain("Already included in the attention rows: 1 check.");
        expect(summary).toContain("Advisory limitations (not part of the evaluated check counts): 2.");
        expect(summary).toContain("Overall verdict: INCOMPLETE.");
        expect(summary).not.toContain("Checks not performed: 3.");
    });

    test("does not imply unperformed checks for non-gating advisory limitations on a PASS", () => {
        const data = buildTowerReportData(
            baseSnapshot({
                verdict: "PASS",
                failedChecks: [],
                notChecked: [
                    {
                        item: "Pad reactions",
                        reason: "Not implemented in the Tower Planner; foundation checks are not performed.",
                    },
                    {
                        item: "General 3D minimum distance",
                        reason: "Not implemented in the Tower Planner; general clearance is not checked.",
                    },
                ],
            }),
        );

        const summary = data.verdict?.summary ?? "";
        expect(summary).toContain("Checks not performed: 0.");
        expect(summary).toContain("Advisory limitations (not part of the evaluated check counts): 2.");
        expect(summary).toContain("Overall verdict: PASS.");
        expect(summary).not.toContain("Checks not performed: 2.");
    });

    test("discloses inconsistent PASS evidence without changing the verdict", () => {
        const data = buildTowerReportData(
            baseSnapshot({
                verdict: "PASS",
                picks: [reportPick({ label: "P-inconsistent", status: "FAIL" })],
                failedChecks: [
                    {
                        category: "pick",
                        id: "pick-inconsistent",
                        label: "P-inconsistent",
                        status: "FAIL",
                        message: "Utilisation exceeds 100%.",
                    },
                ],
            }),
        );

        const summary = data.verdict?.summary ?? "";
        expect(summary).toContain("Evidence inconsistency: the supplied verdict is PASS");
        expect(summary).toContain("2 non-pass pick/check rows");
        expect(summary).toContain("The verdict is reproduced unchanged.");
        expect(data.verdict?.status).toBe("PASS");
    });

    test("preserves every metric status on a pick row", () => {
        const statuses: readonly MetricStatus[] = METRIC_STATUSES;
        const picks = statuses.map((status, index) => reportPick({ label: `P${index + 1}`, status }));
        const data = buildTowerReportData(baseSnapshot({ picks }));
        const rows = rowsById(data, "picks");

        expect(rows).toHaveLength(statuses.length);
        expect(rows.map((row) => row.status)).toEqual(statuses);
        expect(rows.map((row) => row.cells.pick)).toEqual(statuses.map((_, index) => `P${index + 1}`));
    });

    test("keeps null capacity and radius as missing values, never zero", () => {
        const data = buildTowerReportData(
            baseSnapshot({
                picks: [
                    reportPick({
                        label: "P-null",
                        radiusM: null,
                        supplyRadiusM: null,
                        dropRadiusM: null,
                        capacityT: null,
                        utilisationPct: null,
                    }),
                ],
            }),
        );
        const row = rowsById(data, "picks")[0];

        expect(row.cells.capacityT).toBeNull();
        expect(row.cells.radiusM).toBeNull();
        expect(row.cells.supplyRadiusM).toBeNull();
        expect(row.cells.dropRadiusM).toBeNull();
        expect(row.cells.utilisationPct).toBeNull();
        expect(row.cells.capacityT).not.toBe(0);
        expect(row.cells.radiusM).not.toBe(0);
    });

    test("preserves failed-check statuses, messages and not-checked reasons", () => {
        const data = buildTowerReportData(
            baseSnapshot({
                verdict: "INCOMPLETE",
                failedChecks: [
                    {
                        category: "height",
                        id: "hook-height",
                        label: "Hook height",
                        status: "NOT_CHECKED",
                        message: "No building heights were supplied.",
                        requiredM: 60,
                        availableM: undefined,
                    },
                ],
                notChecked: [
                    {
                        item: "Height and tie-in (T9)",
                        reason: "T9 could not run because no building heights were supplied.",
                    },
                ],
            }),
        );

        const attention = rowsById(data, "checks-attention");
        expect(attention).toHaveLength(1);
        expect(attention[0].status).toBe("NOT_CHECKED");
        expect(attention[0].cells).toMatchObject({
            category: "height",
            check: "Hook height",
            message: "No building heights were supplied.",
            requiredM: 60,
            availableM: null,
        });

        const notPerformed = rowsById(data, "checks-not-performed");
        expect(notPerformed).toHaveLength(1);
        expect(notPerformed[0].cells).toEqual({
            item: "Height and tie-in (T9)",
            reason: "T9 could not run because no building heights were supplied.",
        });
    });

    test("omits T8 results but keeps planned T9 parameters when those reports are absent", () => {
        const data = buildTowerReportData(baseSnapshot({ oversail: null, height: null }));
        const ids = data.sections.map((section) => section.id);
        const height = sectionById(data, "height-tie-in");

        expect(ids).not.toContain("oversail-checks");
        expect(height.description).toContain("No T9 height report was supplied");
        expect(height.metrics).toContainEqual(
            expect.objectContaining({ label: "Hook height", value: 80, unit: "m" }),
        );
        expect(height.rows).toBeUndefined();
    });

    test("maps T8 and T9 results, sources and parameters when present", () => {
        const oversail: TowerReportOversail = {
            overallStatus: "WARN",
            results: [
                {
                    id: "power-line",
                    kind: "power_line",
                    label: "Power line",
                    status: "WARN",
                    oversailDepthM: 7,
                    message: "Power-line clearance requires permission.",
                    source: "Synthetic power-line clearance",
                    requiredM: 46,
                    availableM: 39,
                },
            ],
        };
        const height: TowerReportHeight = {
            ...passingHeight(),
            overallStatus: "WARN",
            results: [
                {
                    id: "tie_in",
                    kind: "tie_in",
                    label: "Tie-in spacing",
                    status: "WARN",
                    message: "Tie-in required at 50 m.",
                    requiredM: 45,
                    availableM: 50,
                },
            ],
            tieInRequired: true,
            tieInLevelsM: [50, 75],
            buildingHeightM: 42,
            freestandingHeightM: 50,
            controllingBuilding: { id: "school", label: "School", heightM: 42 },
        };
        const data = buildTowerReportData(baseSnapshot({ oversail, height }));

        const t8 = sectionById(data, "oversail-checks");
        expect(t8.metrics).toContainEqual(
            expect.objectContaining({ label: "Overall T8 result", value: "WARN", status: "WARN" }),
        );
        expect(rowsById(data, "oversail-checks")[0]).toMatchObject({
            status: "WARN",
            cells: {
                check: "Power line",
                kind: "power_line",
                depthM: 7,
                requiredM: 46,
                availableM: 39,
                message: "Power-line clearance requires permission.",
                source: "Synthetic power-line clearance",
            },
        });

        const t9 = sectionById(data, "height-tie-in");
        expect(t9.metrics).toContainEqual(
            expect.objectContaining({ label: "Overall T9 result", value: "WARN", status: "WARN" }),
        );
        expect(t9.metrics).toContainEqual(
            expect.objectContaining({ label: "Tie-in required", value: "Yes" }),
        );
        expect(t9.metrics).toContainEqual(
            expect.objectContaining({ label: "Tie-in levels", value: "50, 75", unit: "m" }),
        );
        expect(t9.metrics).toContainEqual(
            expect.objectContaining({ label: "T9 report valid", value: "Yes" }),
        );
        expect(t9.metrics).toContainEqual(
            expect.objectContaining({ label: "Controlling building height", value: 42, unit: "m" }),
        );
        expect(t9.metrics).toContainEqual(
            expect.objectContaining({ label: "Freestanding height (T9 input)", value: 50, unit: "m" }),
        );
        expect(rowsById(data, "height-tie-in")[0]).toMatchObject({
            status: "WARN",
            cells: {
                check: "Tie-in spacing",
                kind: "tie_in",
                requiredM: 45,
                availableM: 50,
                message: "Tie-in required at 50 m.",
            },
        });
    });

    test("shows planned T9 parameters when T9 did not run", () => {
        const parameters = makeHeightParameters({
            hookHeight: 72,
            hookClearance: 3,
            freestandingHeight: 48,
            tieInSpacing: 12,
        });
        const data = buildTowerReportData(baseSnapshot({ height: null, heightParameters: parameters }));
        const section = sectionById(data, "height-tie-in");

        expect(section.description).toContain("No T9 height report was supplied");
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Hook height", value: 72, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Hook clearance", value: 3, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Freestanding height", value: 48, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Tie-in spacing", value: 12, unit: "m" }),
        );
        expect(section.rows).toBeUndefined();

        const html = generateReportHtml(data);
        expect(html).toContain("No T9 height report was supplied");
        expect(html).toContain("Hook height");
        expect(html).toContain("72");
        expect(html).toContain("Tie-in spacing");
        expect(html).toContain("12");
    });

    test("preserves invalid T9 details and does not infer tie-in levels", () => {
        const height: TowerReportHeight = {
            ...passingHeight(),
            valid: false,
            overallStatus: "NOT_CHECKED",
            results: [],
            errors: ["No building heights were supplied."],
            tieInRequired: true,
            tieInLevelsM: [],
            freestandingHeightM: 50,
        };
        const data = buildTowerReportData(baseSnapshot({ height }));
        const section = sectionById(data, "height-tie-in");

        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "T9 report valid", value: "No" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Tie-in required", value: "Yes" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({
                label: "Tie-in levels",
                value: null,
                notes: "Tie-in is required, but no tie-in levels were supplied.",
            }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Freestanding height (T9 input)", value: 50, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({
                label: "T9 input errors",
                value: "No building heights were supplied.",
            }),
        );
        expect(section.rows).toBeUndefined();
    });

    test("preserves site details when the T8 report is absent", () => {
        const site: OversailSite = {
            boundary: {
                polygon: rect(0, 0, 40, 30),
                source: "Topographic survey p. 2",
            },
            neighbours: [
                {
                    id: "neighbour-a",
                    label: "Neighbour A",
                    displayName: "Neighbour A warehouse",
                    polygon: rect(50, 0, 60, 10),
                    rule: "no_oversail",
                },
            ],
            noGoZones: [
                {
                    id: "substation",
                    label: "Substation",
                    center: { x: 15, y: 20 },
                    radiusM: 6,
                },
            ],
            buildings: [
                { id: "school", label: "School", heightM: 24 },
                { id: "shed", label: "Shed" },
            ],
            road: {
                yFromM: 5,
                yToM: 9,
                rule: "road exclusion",
                source: "Road survey p. 1",
            },
            powerLine: {
                xM: 25,
                clearanceM: 12,
                voltageKv: 33,
                sourceNote: "Utility drawing p. 3",
                indicative: true,
            },
        };
        const data = buildTowerReportData(baseSnapshot({ site, oversail: null, verdict: "INCOMPLETE" }));

        const summary = sectionById(data, "site-summary");
        expect(summary.metrics).toContainEqual(
            expect.objectContaining({ label: "Boundary points", value: 4 }),
        );
        expect(summary.metrics).toContainEqual(expect.objectContaining({ label: "Neighbours", value: 1 }));
        expect(summary.metrics).toContainEqual(expect.objectContaining({ label: "No-go zones", value: 1 }));
        expect(summary.metrics).toContainEqual(expect.objectContaining({ label: "Buildings", value: 2 }));

        const boundary = rowsById(data, "site-boundary");
        expect(boundary).toHaveLength(4);
        expect(boundary[0].cells).toEqual({ point: "P1", x: 0, y: 0 });
        expect(boundary[2].cells).toEqual({ point: "P3", x: 40, y: 30 });

        expect(rowsById(data, "site-neighbours")[0].cells).toMatchObject({
            id: "neighbour-a",
            neighbour: "Neighbour A",
            displayName: "Neighbour A warehouse",
            rule: "no_oversail",
            points: 4,
            polygon: "(50, 0) → (60, 0) → (60, 10) → (50, 10)",
        });
        expect(rowsById(data, "site-no-go-zones")[0].cells).toEqual({
            label: "Substation",
            center: "(15, 20)",
            radiusM: 6,
        });
        expect(rowsById(data, "site-buildings")).toMatchObject([
            { cells: { label: "School", heightM: 24 } },
            { cells: { label: "Shed", heightM: null } },
        ]);

        const html = generateReportHtml(data);
        expect(html).toContain("Neighbour A warehouse");
        expect(html).toContain("Substation");
        expect(html).toContain("School");
        expect(html).toContain("(15, 20)");
    });

    test("includes catalogue crane values and preserves NotStated reasons", () => {
        const data = buildTowerReportData(baseSnapshot());
        const section = sectionById(data, "crane-configuration");
        const freestanding = section.metrics?.find(
            (metric) => metric.label === "Catalogue freestanding height",
        );

        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Maximum capacity", value: 5, unit: "t" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Catalogue default jib length", value: 30, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Maximum jib length", value: 52, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Height under hook", value: 43.1, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Mast width", value: 1.2, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Base width", value: 3.8, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Counter-jib length", value: 11.9, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Counter-jib radius", value: 13.7, unit: "m" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({ label: "Heaviest erection component", value: "Counter-jib" }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({
                label: "Heaviest erection component mass",
                value: 4.38,
                unit: "t",
            }),
        );
        expect(section.metrics).toContainEqual(
            expect.objectContaining({
                label: "Combined transport package",
                value: null,
            }),
        );

        expect(freestanding?.value).toBeNull();
        expect(freestanding?.value).not.toBe(0);
        expect(freestanding?.notes).toContain("does not label a freestanding-height limit");
    });

    test("maps documented sources to S7 and preserves their page and status", () => {
        const data = buildTowerReportData(baseSnapshot());

        expect(data.sources).toHaveLength(1);
        expect(data.sources[0]).toEqual({
            item: "Capacity basis",
            document: MCT88.sources.datasheetLoadCharts.document,
            page: MCT88.sources.datasheetLoadCharts.page,
            status: "VERIFIED",
        });
    });

    test("preserves INDICATIVE, LEGACY and NOT_STATED provenance in Source notes", () => {
        const indicative: TowerReportSource = {
            item: "Selected jib length",
            status: "INDICATIVE",
            basis: "INDICATIVE project configuration, not a published jib.",
        };
        const legacy: TowerReportSource = {
            item: "Site model",
            status: "LEGACY",
            note: "Synthetic test site boundary.",
        };
        const notStated: TowerReportSource = {
            item: "Heaviest erection component",
            status: "NOT_STATED",
            note: "The inspected documents do not state this value.",
        };
        const documentedWithNote: TowerReportSource = {
            item: "Capacity basis",
            status: "VERIFIED",
            document: MCT88.sources.datasheetLoadCharts.document,
            page: MCT88.sources.datasheetLoadCharts.page,
            note: "Per-radius load chart note.",
        };
        const data = buildTowerReportData(
            baseSnapshot({ sources: [documentedWithNote, indicative, legacy, notStated] }),
        );

        expect(data.sources).toEqual([
            {
                item: "Capacity basis",
                document: MCT88.sources.datasheetLoadCharts.document,
                page: MCT88.sources.datasheetLoadCharts.page,
                status: "VERIFIED",
            },
        ]);

        expect(rowByItem(data, "source-notes", indicative.item)).toMatchObject({
            cells: { item: indicative.item, status: "INDICATIVE", basis: indicative.basis, note: null },
        });
        expect(rowByItem(data, "source-notes", legacy.item)).toMatchObject({
            cells: { item: legacy.item, status: "LEGACY", note: legacy.note },
        });
        expect(rowByItem(data, "source-notes", notStated.item)).toMatchObject({
            cells: { item: notStated.item, status: "NOT_STATED", note: notStated.note },
        });
        expect(rowByItem(data, "source-notes", documentedWithNote.item)).toMatchObject({
            cells: {
                item: documentedWithNote.item,
                status: "VERIFIED",
                note: documentedWithNote.note,
            },
        });
    });

    test("omits Source notes when every source is documented and has no note", () => {
        const data = buildTowerReportData(baseSnapshot({ sources: [VERIFIED_SOURCE] }));

        expect(data.sections.some((section) => section.id === "source-notes")).toBe(false);
    });

    test("passes assumptions and notes through unchanged", () => {
        const assumptions = [
            { category: "operational" as const, description: "Mast position is entered by the planner." },
            { category: "general" as const, description: "The report is a planning aid." },
        ];
        const notes = ["First supplied note.", "Second supplied note."];
        const data = buildTowerReportData(baseSnapshot({ assumptions, notes }));

        expect(data.assumptions).toEqual(assumptions);
        expect(data.notes).toEqual(notes);
    });

    test("is deterministic for the same snapshot", () => {
        const snapshot = baseSnapshot();

        expect(buildTowerReportData(snapshot)).toStrictEqual(buildTowerReportData(snapshot));
    });

    test("does not mutate a deep-frozen snapshot-local clone", () => {
        const snapshot = deepFreeze(
            structuredClone(
                baseSnapshot({
                    oversail: passingOversail(),
                    height: passingHeight(),
                    notes: ["Frozen note."],
                }),
            ),
        );
        const before = JSON.stringify(snapshot);

        expect(Object.isFrozen(snapshot.crane)).toBe(true);
        expect(Object.isFrozen(MCT88)).toBe(false);

        const data = buildTowerReportData(snapshot);

        expect(JSON.stringify(snapshot)).toBe(before);
        expect(data).not.toBe(snapshot);
        expect(Object.isFrozen(MCT88)).toBe(false);
    });

    test("produces data accepted by the S7 validator and renderer", () => {
        const data = buildTowerReportData(
            baseSnapshot({
                verdict: "FAIL",
                picks: [reportPick({ label: "P-null", status: "FAIL", capacityT: null, radiusM: null })],
                failedChecks: [
                    {
                        category: "pick",
                        id: "pick-1",
                        label: "P-null",
                        status: "FAIL",
                        message: "No capacity is available for this pick.",
                    },
                ],
            }),
        );

        expect(() => validateReportData(data)).not.toThrow();

        const html = generateReportHtml(data);
        expect(html).toContain("Tower Crane Lift Plan");
        expect(html).toContain("Tower Crane Planner");
        expect(html).toContain(REQUIRED_DISCLAIMER);
        expect(html).toContain('<span class="badge badge-FAIL">FAIL</span>');
        expect(html).toContain("—");
        expect(html).not.toMatch(/>\s*(NaN|undefined|null)\s*</);
    });

    test("hand-worked case: two picks and one not-checked T9 check", () => {
        const passingPick = reportPick({
            label: "P1",
            radiusM: 20,
            supplyRadiusM: 20,
            dropRadiusM: 20,
            loadT: 2,
            capacityT: 5,
            utilisationPct: 40,
            status: "PASS",
        });
        const failingPick = reportPick({
            label: "P2",
            radiusM: 30,
            supplyRadiusM: 30,
            dropRadiusM: 30,
            governing: "drop",
            loadT: 6,
            capacityT: 5,
            utilisationPct: 120,
            status: "FAIL",
        });
        const height: TowerReportHeight = {
            ...passingHeight(),
            valid: false,
            overallStatus: "NOT_CHECKED",
            results: [
                {
                    id: "tie_in",
                    kind: "tie_in",
                    label: "Tie-in spacing",
                    status: "NOT_CHECKED",
                    message: "Tie-in check unavailable: no building heights were supplied.",
                },
            ],
            tieInRequired: false,
            tieInLevelsM: [],
        };
        const data = buildTowerReportData(
            baseSnapshot({
                verdict: "FAIL",
                picks: [passingPick, failingPick],
                height,
                evaluation: { ...baseSnapshot().evaluation, allPass: false, failedCount: 1 },
                failedChecks: [
                    {
                        category: "pick",
                        id: "pick-2",
                        label: "P2",
                        status: "FAIL",
                        message: "Utilisation 120% exceeds 100%.",
                    },
                    {
                        category: "height",
                        id: "tie_in",
                        label: "Height and tie-in checks (T9)",
                        status: "NOT_CHECKED",
                        message: "Tie-in check unavailable: no building heights were supplied.",
                    },
                ],
                notChecked: [
                    {
                        item: "Height and tie-in checks (T9)",
                        reason: "No building heights were supplied, so T9 did not run.",
                    },
                ],
            }),
        );

        const summary = data.verdict?.summary ?? "";
        expect(data.verdict?.status).toBe("FAIL");
        expect(summary).toContain("2 pick checks: 1 passed, 1 failed, 0 unresolved, 0 not checked.");
        expect(summary).toContain(
            "Checks requiring attention (2 rows): 1 failed, 0 unresolved, 1 not checked.",
        );
        expect(summary).toContain("Checks not performed: 1.");
        expect(summary).toContain("Overall verdict: FAIL.");

        expect(rowsById(data, "picks").map((row) => row.status)).toEqual(["PASS", "FAIL"]);
        expect(rowsById(data, "height-tie-in")[0].status).toBe("NOT_CHECKED");
        expect(rowsById(data, "checks-not-performed")[0].cells.reason).toBe(
            "No building heights were supplied, so T9 did not run.",
        );

        const html = generateReportHtml(data);
        expect(html).toContain("P2");
        expect(html).toContain("120");
        expect(html).toContain('<span class="badge badge-FAIL">FAIL</span>');
        expect(html).toContain('<span class="badge badge-NOT_CHECKED">NOT_CHECKED</span>');
        expect(html).toContain("Tie-in check unavailable: no building heights were supplied.");
    });
});
