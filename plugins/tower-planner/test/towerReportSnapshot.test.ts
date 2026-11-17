// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import { WIND_DERATE_RULE } from "../src/capacity";
import { MCT85F5, MCT88 } from "../src/catalogue";
import type { CraneDimension } from "../src/model/cranePlacement";
import { createDefaultCraneCatalogue } from "../src/model/cranePlacement";
import { createDefaultHeightParameters } from "../src/model/heightChecks";
import type { HeightCheckReport, HeightParameters } from "../src/model/heightTypes";
import { evaluateOversailChecks } from "../src/model/oversailChecks";
import type { OversailNoGoZone, OversailReport, OversailSite } from "../src/model/oversailTypes";
import type {
    TowerPlanCraneEvaluation,
    TowerPlanPickEvaluation,
    TowerPlanSiteProvenance,
    TowerPlanState,
} from "../src/model/towerPlanState";
import { buildTowerReportSnapshot } from "../src/report/towerReportSnapshot";
import {
    mapCapacityBasis,
    mapCraneDimension,
    mapSiteProvenance,
    mapSourcedNumber,
    toMetricStatus,
    verdictFromStatuses,
} from "../src/report/towerReportStatus";
import type { LoadChartPoint, SourceDocument, SourcedNumber, TowerCrane } from "../src/types";

function rect(x1: number, y1: number, x2: number, y2: number) {
    return [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
    ];
}

const SITE: OversailSite = {
    boundary: { polygon: rect(-1000, -1000, 1000, 1000), source: "test boundary" },
    neighbours: [],
    noGoZones: [],
};

function pick(overrides: Partial<TowerPlanPickEvaluation> = {}): TowerPlanPickEvaluation {
    return {
        craneId: MCT88.id,
        craneName: MCT88.name,
        label: "P1",
        jibM: 30,
        loadT: 1,
        radiusM: 20,
        windKmh: null,
        capacityT: 5,
        utilisationPct: 20,
        status: "PASS",
        ...overrides,
    };
}

function evaluation(overrides: Partial<TowerPlanCraneEvaluation> = {}): TowerPlanCraneEvaluation {
    return {
        craneId: MCT88.id,
        craneName: MCT88.name,
        jibM: 30,
        windKmh: null,
        picks: [pick()],
        allPass: true,
        failedCount: 0,
        ...overrides,
    };
}

function passingOversail(): OversailReport {
    return {
        overallStatus: "pass",
        results: [
            {
                id: "boundary",
                kind: "boundary",
                label: "Site boundary",
                status: "pass",
                oversailDepthM: 0,
                message: "No oversail of site boundary.",
            },
        ],
    };
}

function passingHeight(): HeightCheckReport {
    return {
        valid: true,
        errors: [],
        results: [
            {
                id: "hook_height",
                kind: "hook_height",
                label: "Hook height",
                status: "pass",
                message: "Hook height OK.",
            },
        ],
        overallStatus: "pass",
        tieInRequired: false,
        tieInLevelsM: [],
    };
}

function emptyOversail(overallStatus: OversailReport["overallStatus"]): OversailReport {
    return { overallStatus, results: [] };
}

function emptyHeight(overallStatus: HeightCheckReport["overallStatus"], valid = true): HeightCheckReport {
    return {
        valid,
        errors: [],
        results: [],
        overallStatus,
        tieInRequired: overallStatus === "tie_in_required",
        tieInLevelsM: [],
    };
}

function makeState(overrides: Partial<TowerPlanState> = {}): TowerPlanState {
    return {
        metadata: {
            projectName: "T10 Snapshot Test",
            siteLocation: "Test Site",
            date: "2026-11-11",
            author: "Test Engineer",
        },
        site: SITE,
        siteProvenance: { kind: "legacy", note: "Synthetic test site" },
        crane: MCT88,
        placement: { x: 30, y: 40, slewAngleDeg: 0 },
        jibM: { value: 30, provenance: { kind: "indicative", basis: "Test jib selection" } },
        windKmh: null,
        craneEvaluation: evaluation(),
        oversailReport: passingOversail(),
        heightReport: passingHeight(),
        heightParameters: createDefaultHeightParameters(),
        notes: ["Test note"],
        assumptions: [{ category: "general", description: "Test assumption" }],
        ...overrides,
    };
}

function stateForCrane(
    crane: TowerCrane,
    jib: SourcedNumber,
    overrides: Partial<TowerPlanState> = {},
): TowerPlanState {
    return makeState({
        crane,
        jibM: jib,
        craneEvaluation: evaluation({
            craneId: crane.id,
            craneName: crane.name,
            jibM: jib.value,
            picks: [pick({ craneId: crane.id, craneName: crane.name, jibM: jib.value })],
        }),
        ...overrides,
    });
}

/**
 * PR #16 added a per-radius load chart to the catalogue MCT 88. The tip-load
 * path is still supported for models without a chart, so tip-load-specific
 * tests use a clone with the chart removed rather than inventing a new
 * expectation for the catalogue entry.
 */
const MCT88_TIP_LOAD_ONLY = (() => {
    const crane = structuredClone(MCT88);
    delete crane.loadChart;
    return crane;
})();

function findResult<T extends { id: string }>(results: readonly T[] | undefined, id: string): T {
    const result = results?.find((item) => item.id === id);
    if (!result) throw new Error(`missing result: ${id}`);
    return result;
}

function findSource(
    snapshot: ReturnType<typeof buildTowerReportSnapshot>,
    item: string,
): ReturnType<typeof buildTowerReportSnapshot>["sources"][number] {
    const source = snapshot.sources.find((entry) => entry.item === item);
    if (!source) throw new Error(`missing source: ${item}`);
    return source;
}

function documentWithPage(page: unknown): SourceDocument {
    return { document: "Test document", page } as unknown as SourceDocument;
}

function siteProvenanceWithPage(page: unknown): TowerPlanSiteProvenance {
    return { kind: "source", document: "Site DXF", page } as unknown as TowerPlanSiteProvenance;
}

describe("T10 tower report snapshot", () => {
    test("permission_needed maps to WARN, never PASS", () => {
        const oversail: OversailReport = {
            overallStatus: "permission_needed",
            results: [
                {
                    id: "neighbour:school",
                    kind: "neighbour",
                    label: "Neighbour - school",
                    status: "permission_needed",
                    oversailDepthM: 2,
                    message: "Permission required from the school.",
                },
            ],
        };

        const snapshot = buildTowerReportSnapshot(makeState({ oversailReport: oversail }));

        expect(snapshot.oversail?.overallStatus).toBe("WARN");
        expect(snapshot.oversail?.results[0].status).toBe("WARN");
        expect(snapshot.verdict).toBe("WARN");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "neighbour:school", status: "WARN" }),
        );
    });

    test("tie_in_required maps to WARN, never PASS", () => {
        const height: HeightCheckReport = {
            ...passingHeight(),
            overallStatus: "tie_in_required",
            tieInRequired: true,
            tieInLevelsM: [50, 70],
            results: [
                {
                    id: "hook_height",
                    kind: "hook_height",
                    label: "Hook height",
                    status: "pass",
                    message: "Hook height OK.",
                },
                {
                    id: "freestanding",
                    kind: "freestanding",
                    label: "Freestanding height",
                    status: "tie_in_required",
                    message: "Tie-in required: freestanding height 50.0 m is below the required 77.0 m.",
                },
                {
                    id: "tie_in",
                    kind: "tie_in",
                    label: "Tie-in levels",
                    status: "tie_in_required",
                    message: "Tie-in required at 2 level(s): 50.0, 70.0 m above ground.",
                },
            ],
        };

        const snapshot = buildTowerReportSnapshot(makeState({ heightReport: height }));

        expect(snapshot.height?.overallStatus).toBe("WARN");
        expect(snapshot.height?.results.map((result) => result.status)).toEqual(["PASS", "WARN", "WARN"]);
        expect(snapshot.verdict).toBe("WARN");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "freestanding", status: "WARN" }),
        );
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "tie_in", status: "WARN" }),
        );
    });

    test("unavailable height checks become NOT_CHECKED and INCOMPLETE", () => {
        const height: HeightCheckReport = {
            valid: false,
            errors: ["Building height unavailable: no building heights were supplied."],
            results: [],
            overallStatus: "unavailable",
            tieInRequired: false,
            tieInLevelsM: [],
        };

        const snapshot = buildTowerReportSnapshot(makeState({ heightReport: height }));

        expect(snapshot.height?.overallStatus).toBe("NOT_CHECKED");
        expect(snapshot.verdict).toBe("INCOMPLETE");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "height-unavailable", status: "NOT_CHECKED" }),
        );
        expect(snapshot.notChecked).toContainEqual(
            expect.objectContaining({ item: "Height and tie-in checks (T9)" }),
        );
    });

    test("OUT_OF_RANGE, UNSUPPORTED and INVALID are preserved and never become PASS", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                craneEvaluation: evaluation({
                    picks: [
                        pick({ label: "P1", status: "OUT_OF_RANGE" }),
                        pick({ label: "P2", status: "UNSUPPORTED" }),
                        pick({ label: "P3", status: "INVALID", issue: "invalid-load" }),
                    ],
                    allPass: false,
                    failedCount: 3,
                }),
            }),
        );

        expect(snapshot.picks.map((item) => item.status)).toEqual(["OUT_OF_RANGE", "UNSUPPORTED", "INVALID"]);
        expect(snapshot.verdict).toBe("INCOMPLETE");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "pick-1", status: "OUT_OF_RANGE" }),
        );
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "pick-2", status: "UNSUPPORTED" }),
        );
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "pick-3", status: "INVALID" }),
        );
    });

    test("mixed PASS and non-PASS pick rows keep every row and list only non-pass checks", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                craneEvaluation: evaluation({
                    picks: [pick({ label: "Passing" }), pick({ label: "Failing", status: "FAIL", loadT: 6 })],
                    allPass: false,
                    failedCount: 1,
                }),
            }),
        );

        expect(snapshot.picks.map((item) => item.status)).toEqual(["PASS", "FAIL"]);
        expect(snapshot.verdict).toBe("FAIL");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "pick-2", status: "FAIL" }),
        );
        expect(snapshot.failedChecks.some((check) => check.id === "pick-1")).toBe(false);
    });

    test("a mixed PASS and OUT_OF_RANGE pick set is INCOMPLETE", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                craneEvaluation: evaluation({
                    picks: [pick({ label: "Passing" }), pick({ label: "Too far", status: "OUT_OF_RANGE" })],
                    allPass: false,
                    failedCount: 1,
                }),
            }),
        );

        expect(snapshot.picks.map((item) => item.status)).toEqual(["PASS", "OUT_OF_RANGE"]);
        expect(snapshot.verdict).toBe("INCOMPLETE");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "pick-2", status: "OUT_OF_RANGE" }),
        );
    });

    test("empty pick evaluations are INCOMPLETE and disclosed", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                craneEvaluation: evaluation({ picks: [], allPass: false, failedCount: 0 }),
            }),
        );

        expect(snapshot.picks).toEqual([]);
        expect(snapshot.verdict).toBe("INCOMPLETE");
        expect(snapshot.notChecked).toContainEqual(expect.objectContaining({ item: "Pick capacity checks" }));
        expect(snapshot.failedChecks.some((check) => check.category === "pick")).toBe(false);
    });

    test("an all-pass fixture is PASS and still discloses the unimplemented checks", () => {
        const snapshot = buildTowerReportSnapshot(makeState());

        expect(snapshot.picks.every((item) => item.status === "PASS")).toBe(true);
        expect(snapshot.verdict).toBe("PASS");
        expect(snapshot.evaluation).toEqual({
            craneId: MCT88.id,
            craneName: MCT88.name,
            jibM: 30,
            windKmh: null,
            allPass: true,
            failedCount: 0,
        });
        expect(snapshot.notChecked).toContainEqual(expect.objectContaining({ item: "Pad reactions" }));
        expect(snapshot.notChecked).toContainEqual(
            expect.objectContaining({ item: "General 3D minimum distance" }),
        );
    });

    test("a report without a site cannot be PASS", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({ site: null, siteProvenance: { kind: "not_stated" } }),
        );

        expect(snapshot.site).toBeNull();
        expect(snapshot.siteSource).toBeNull();
        expect(snapshot.verdict).toBe("INCOMPLETE");
        expect(snapshot.notChecked).toContainEqual(expect.objectContaining({ item: "Site model" }));
    });

    test("FAIL takes precedence over INCOMPLETE", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                craneEvaluation: evaluation({
                    picks: [pick({ status: "FAIL", loadT: 6 })],
                    allPass: false,
                    failedCount: 1,
                }),
                heightReport: null,
            }),
        );

        expect(snapshot.height).toBeNull();
        expect(snapshot.verdict).toBe("FAIL");
    });

    test("missing T8 and missing T9 independently make the verdict INCOMPLETE", () => {
        const noOversail = buildTowerReportSnapshot(makeState({ oversailReport: null }));
        expect(noOversail.oversail).toBeNull();
        expect(noOversail.verdict).toBe("INCOMPLETE");
        expect(noOversail.notChecked).toContainEqual(
            expect.objectContaining({ item: "Oversail checks (T8)" }),
        );

        const noHeight = buildTowerReportSnapshot(makeState({ heightReport: null }));
        expect(noHeight.height).toBeNull();
        expect(noHeight.verdict).toBe("INCOMPLETE");
        expect(noHeight.notChecked).toContainEqual(
            expect.objectContaining({ item: "Height and tie-in checks (T9)" }),
        );
    });

    test("height parameters survive a missing T9 report", () => {
        // Deliberately non-default values: if the builder ignored the caller's
        // parameters and recreated the defaults, these assertions would fail.
        const parameters: HeightParameters = {
            hookHeight: {
                value: 91,
                source: { kind: "indicative", note: "INDICATIVE test hook height" },
            },
            hookClearance: {
                value: 3,
                source: { kind: "indicative", note: "INDICATIVE test hook clearance" },
            },
            freestandingHeight: {
                value: 55,
                source: { kind: "indicative", note: "INDICATIVE test freestanding height" },
            },
            tieInSpacing: {
                value: 25,
                source: { kind: "indicative", note: "INDICATIVE test tie-in spacing" },
            },
        };
        const snapshot = buildTowerReportSnapshot(
            makeState({ heightReport: null, heightParameters: parameters }),
        );

        // The top-level values are the four planned inputs, not a T9 result.
        expect(snapshot.height).toBeNull();
        expect(snapshot.heightParameters.hookHeight.value).toBe(91);
        expect(snapshot.heightParameters.hookClearance.value).toBe(3);
        expect(snapshot.heightParameters.freestandingHeight.value).toBe(55);
        expect(snapshot.heightParameters.tieInSpacing.value).toBe(25);
        expect(findSource(snapshot, "Hook height (available)").basis).toBe("INDICATIVE test hook height");
        expect(snapshot.verdict).toBe("INCOMPLETE");
    });

    test("empty T8 result sets are explained for pass, fail and permission_needed", () => {
        const cases: ReadonlyArray<{
            overall: OversailReport["overallStatus"];
            verdict: "INCOMPLETE" | "FAIL";
            checkStatus: "FAIL" | "WARN" | null;
        }> = [
            { overall: "pass", verdict: "INCOMPLETE", checkStatus: null },
            { overall: "fail", verdict: "FAIL", checkStatus: "FAIL" },
            { overall: "permission_needed", verdict: "INCOMPLETE", checkStatus: "WARN" },
        ];

        for (const item of cases) {
            const snapshot = buildTowerReportSnapshot(
                makeState({ oversailReport: emptyOversail(item.overall) }),
            );

            expect(snapshot.verdict).toBe(item.verdict);
            expect(snapshot.notChecked).toContainEqual(
                expect.objectContaining({ item: "Oversail checks (T8)" }),
            );
            if (item.checkStatus === null) {
                expect(snapshot.failedChecks.some((check) => check.id === "oversail-overall")).toBe(false);
            } else {
                expect(snapshot.failedChecks).toContainEqual(
                    expect.objectContaining({ id: "oversail-overall", status: item.checkStatus }),
                );
            }
        }
    });

    test("empty T9 result sets are explained for pass, fail and tie_in_required", () => {
        const cases: ReadonlyArray<{
            overall: HeightCheckReport["overallStatus"];
            verdict: "INCOMPLETE" | "FAIL";
            checkStatus: "FAIL" | "WARN" | null;
        }> = [
            { overall: "pass", verdict: "INCOMPLETE", checkStatus: null },
            { overall: "fail", verdict: "FAIL", checkStatus: "FAIL" },
            { overall: "tie_in_required", verdict: "INCOMPLETE", checkStatus: "WARN" },
        ];

        for (const item of cases) {
            const snapshot = buildTowerReportSnapshot(makeState({ heightReport: emptyHeight(item.overall) }));

            expect(snapshot.verdict).toBe(item.verdict);
            expect(snapshot.notChecked).toContainEqual(
                expect.objectContaining({ item: "Height and tie-in checks (T9)" }),
            );
            if (item.checkStatus === null) {
                expect(snapshot.failedChecks.some((check) => check.id === "height-overall")).toBe(false);
            } else {
                expect(snapshot.failedChecks).toContainEqual(
                    expect.objectContaining({ id: "height-overall", status: item.checkStatus }),
                );
            }
        }
    });

    test("an overall-only T8 warning or fail is disclosed even when every row passes", () => {
        const warning: OversailReport = {
            overallStatus: "permission_needed",
            results: passingOversail().results,
        };
        const warningSnapshot = buildTowerReportSnapshot(makeState({ oversailReport: warning }));
        expect(warningSnapshot.verdict).toBe("WARN");
        expect(warningSnapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "oversail-overall", status: "WARN" }),
        );

        const failure: OversailReport = {
            overallStatus: "fail",
            results: passingOversail().results,
        };
        const failureSnapshot = buildTowerReportSnapshot(makeState({ oversailReport: failure }));
        expect(failureSnapshot.verdict).toBe("FAIL");
        expect(failureSnapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "oversail-overall", status: "FAIL" }),
        );
    });

    test("an overall-only T9 warning or fail is disclosed even when every row passes", () => {
        const warning: HeightCheckReport = {
            ...passingHeight(),
            overallStatus: "tie_in_required",
            tieInRequired: true,
        };
        const warningSnapshot = buildTowerReportSnapshot(makeState({ heightReport: warning }));
        expect(warningSnapshot.verdict).toBe("WARN");
        expect(warningSnapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "height-overall", status: "WARN" }),
        );

        const failure: HeightCheckReport = {
            ...passingHeight(),
            overallStatus: "fail",
        };
        const failureSnapshot = buildTowerReportSnapshot(makeState({ heightReport: failure }));
        expect(failureSnapshot.verdict).toBe("FAIL");
        expect(failureSnapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "height-overall", status: "FAIL" }),
        );
    });

    test("evaluation metadata mismatches are disclosed and force at least INCOMPLETE", () => {
        const cases: ReadonlyArray<{
            name: string;
            metadata: Partial<TowerPlanCraneEvaluation>;
            message: string;
        }> = [
            { name: "crane id", metadata: { craneId: "other-crane" }, message: "crane" },
            { name: "crane name", metadata: { craneName: "Other Crane" }, message: "crane" },
            { name: "jib", metadata: { jibM: 40 }, message: "jib" },
            { name: "wind", metadata: { windKmh: 25 }, message: "wind" },
            { name: "allPass", metadata: { allPass: false }, message: "allPass" },
            { name: "failedCount", metadata: { failedCount: 2 }, message: "failedCount" },
        ];

        for (const item of cases) {
            const snapshot = buildTowerReportSnapshot(
                makeState({ craneEvaluation: evaluation(item.metadata) }),
            );

            expect(snapshot.verdict).toBe("INCOMPLETE");
            expect(snapshot.failedChecks).toContainEqual(
                expect.objectContaining({ id: "pick-evaluation-metadata", status: "INVALID" }),
            );
            const check = snapshot.failedChecks.find((entry) => entry.id === "pick-evaluation-metadata");
            expect(check?.message).toContain(item.message);
        }
    });

    test("per-pick crane, jib and wind metadata mismatches are INVALID", () => {
        const cases: ReadonlyArray<{
            name: string;
            overrides: Partial<TowerPlanPickEvaluation>;
            message: string;
        }> = [
            { name: "crane id", overrides: { craneId: "other-crane" }, message: "crane" },
            { name: "crane name", overrides: { craneName: "Other Crane" }, message: "crane" },
            { name: "jib", overrides: { jibM: 40 }, message: "jib" },
            { name: "wind", overrides: { windKmh: Number.NaN }, message: "wind" },
        ];

        for (const item of cases) {
            const snapshot = buildTowerReportSnapshot(
                makeState({
                    craneEvaluation: evaluation({
                        picks: [pick(item.overrides)],
                        allPass: true,
                        failedCount: 0,
                    }),
                }),
            );

            expect(snapshot.verdict).toBe("INCOMPLETE");
            const check = snapshot.failedChecks.find((entry) => entry.id === "pick-evaluation-metadata");
            if (!check) throw new Error(`missing metadata check for ${item.name}`);
            expect(check.status).toBe("INVALID");
            expect(check.message).toContain("Pick 1");
            expect(check.message).toContain(item.message);
        }
    });

    test("a per-pick wind override is disclosed instead of treated as crane-level wind", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                windKmh: null,
                craneEvaluation: evaluation({
                    picks: [pick({ windKmh: 25 })],
                    allPass: true,
                    failedCount: 0,
                }),
            }),
        );

        expect(snapshot.verdict).toBe("PASS");
        expect(snapshot.assumptions).toContainEqual({
            category: "operational",
            description: WIND_DERATE_RULE.note,
        });
        expect(snapshot.assumptions).toContainEqual(
            expect.objectContaining({
                category: "operational",
                description: expect.stringContaining("25 km/h wind override"),
            }),
        );
        expect(snapshot.assumptions).toContainEqual(
            expect.objectContaining({
                category: "operational",
                description: expect.stringContaining("not the crane-level wind setting"),
            }),
        );
    });

    test("a genuine FAIL still wins over a per-pick metadata mismatch", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                craneEvaluation: evaluation({
                    picks: [pick({ craneId: "other-crane", status: "FAIL", loadT: 6 })],
                    allPass: false,
                    failedCount: 1,
                }),
            }),
        );

        expect(snapshot.picks[0].status).toBe("FAIL");
        expect(snapshot.verdict).toBe("FAIL");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "pick-evaluation-metadata", status: "INVALID" }),
        );
    });

    test("a contradictory allPass cannot hide a failing pick", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                craneEvaluation: evaluation({
                    picks: [pick({ status: "FAIL", loadT: 6 })],
                    allPass: true,
                    failedCount: 0,
                }),
            }),
        );

        expect(snapshot.picks[0].status).toBe("FAIL");
        expect(snapshot.verdict).toBe("FAIL");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "pick-evaluation-metadata", status: "INVALID" }),
        );
    });

    test("source provenance is mapped without overclaiming", () => {
        const snapshot = buildTowerReportSnapshot(makeState());
        const overview = MCT88.sources.datasheetOverview;
        if (!overview) throw new Error("MCT88 overview source is missing");

        expect(snapshot.siteSource).toMatchObject({ status: "LEGACY", note: "Synthetic test site" });
        expect(snapshot.sources).toContainEqual(
            expect.objectContaining({
                item: "Crane maximum capacity",
                status: "VERIFIED",
                document: overview.document,
                page: overview.page,
            }),
        );
        expect(snapshot.sources).toContainEqual(
            expect.objectContaining({
                item: "Selected jib length",
                status: "INDICATIVE",
                basis: "Test jib selection",
            }),
        );
        expect(snapshot.sources).toContainEqual(
            expect.objectContaining({ item: "Hook height (available)", status: "INDICATIVE" }),
        );

        // The placement panel's demo crane uses CraneDimension values. They are
        // INDICATIVE and must never be promoted to VERIFIED.
        const demo = createDefaultCraneCatalogue();
        expect(mapCraneDimension("Demo minimum hook radius", demo.minHookRadius).status).toBe("INDICATIVE");
        expect(mapCraneDimension("Demo maximum hook radius", demo.maxHookRadius).status).not.toBe("VERIFIED");

        const unusedSource = mapSourcedNumber(
            "Unresolved source",
            { value: 1, provenance: { kind: "source", sourceId: "missing-source" } },
            MCT88.sources,
        );
        expect(unusedSource.status).toBe("NOT_STATED");

        const sourcedDimension: CraneDimension = {
            value: 2,
            source: { kind: "sourced", document: "Test document", page: 12 },
        };
        expect(mapCraneDimension("Sourced dimension", sourcedDimension)).toMatchObject({
            status: "VERIFIED",
            document: "Test document",
            page: 12,
        });

        expect(mapSiteProvenance({ kind: "source", document: "Site DXF", page: 2 })).toMatchObject({
            status: "VERIFIED",
            document: "Site DXF",
            page: 2,
        });
    });

    test("the MCT 85 F5 capacity basis cites its load-chart page, not the overview page", () => {
        const chartSource = MCT85F5.sources.datasheetLoadCharts;
        const overview = MCT85F5.sources.datasheetOverview;
        if (!chartSource || !overview) throw new Error("MCT85F5 sources are missing");

        const snapshot = buildTowerReportSnapshot(
            stateForCrane(MCT85F5, {
                value: 30,
                provenance: { kind: "source", sourceId: "datasheetLoadCharts" },
            }),
        );
        const basis = findSource(snapshot, "Capacity basis");

        expect(basis).toMatchObject({
            status: "VERIFIED",
            document: chartSource.document,
            page: 3,
        });
        expect(basis.page).not.toBe(overview.page);
        expect(basis.note).toContain("Per-radius load chart");
    });

    test("the MCT 88 capacity basis cites its tip-load row and discloses the idealisation", () => {
        const tipRow = MCT88.tipLoadByJib.find((row) => row.jibM.value === 30);
        if (!tipRow || tipRow.tipT.provenance.kind !== "source") {
            throw new Error("MCT88 30 m tip-load row is missing its source");
        }
        const tipSource = MCT88.sources[tipRow.tipT.provenance.sourceId];
        if (!tipSource) throw new Error("MCT88 tip-load source is missing");

        const snapshot = buildTowerReportSnapshot(makeState({ crane: MCT88_TIP_LOAD_ONLY }));
        const basis = findSource(snapshot, "Capacity basis");

        expect(basis).toMatchObject({
            status: "VERIFIED",
            document: tipSource.document,
            page: tipSource.page,
        });
        expect(basis.page).toBe(4);
        expect(basis.note).toContain("Tip-load idealisation");
    });

    test("the catalogue MCT 88 capacity basis cites its per-radius load chart", () => {
        const chartSource = MCT88.sources.datasheetLoadCharts;
        if (!chartSource) throw new Error("MCT88 load chart source is missing");

        const snapshot = buildTowerReportSnapshot(makeState());
        const basis = findSource(snapshot, "Capacity basis");

        expect(basis).toMatchObject({
            status: "VERIFIED",
            document: chartSource.document,
            page: chartSource.page,
        });
        expect(basis.page).toBe(4);
        expect(basis.note).toContain("Per-radius load chart");
    });

    test("interpolated tip-load capacity cites both bounding rows", () => {
        const snapshot = buildTowerReportSnapshot(
            stateForCrane(MCT88_TIP_LOAD_ONLY, {
                value: 32.5,
                provenance: { kind: "indicative", basis: "32.5 m project configuration" },
            }),
        );
        const basis = findSource(snapshot, "Capacity basis");

        expect(basis.status).toBe("VERIFIED");
        expect(basis.note).toContain("Interpolated between the published 30 m and 35 m tip-load rows");
    });

    test("a jib just above a published tip-load row is interpolated, not exact", () => {
        const basis = mapCapacityBasis(MCT88_TIP_LOAD_ONLY, 30.0000005);

        expect(basis.status).toBe("VERIFIED");
        expect(basis.note).toContain("Interpolated between the published 30 m and 35 m tip-load rows");
    });

    test("an unresolvable capacity basis is NOT_STATED, not guessed", () => {
        const unpublishedChartJib = mapCapacityBasis(MCT85F5, 32);
        expect(unpublishedChartJib.status).toBe("NOT_STATED");
        expect(unpublishedChartJib.note).toContain("No published load chart");

        const outsideTipRange = mapCapacityBasis(MCT88_TIP_LOAD_ONLY, 60);
        expect(outsideTipRange.status).toBe("NOT_STATED");
        expect(outsideTipRange.note).toContain("outside the published tip-load range");

        const crane = structuredClone(MCT88_TIP_LOAD_ONLY);
        crane.tipLoadByJib[2].tipT.provenance = { kind: "source", sourceId: "missing-source" };
        const missingSource = mapCapacityBasis(crane, 30);
        expect(missingSource.status).toBe("NOT_STATED");
        expect(missingSource.note).toContain("not found");

        const chartCrane = structuredClone(MCT85F5);
        const chart = chartCrane.loadChart?.[2];
        if (!chart) throw new Error("MCT85F5 chart is missing");
        chart.points[0].capacityT.provenance = {
            kind: "source",
            sourceId: "missing-source",
        };
        const missingChartSource = mapCapacityBasis(chartCrane, 30);
        expect(missingChartSource.status).toBe("NOT_STATED");
        expect(missingChartSource.note).toContain("not found");
    });

    test("chart capacity provenance follows the points used by the pick radius", () => {
        const crane = structuredClone(MCT85F5);
        const chart = crane.loadChart?.find((row) => row.jibM.value === 30);
        if (!chart) throw new Error("MCT85F5 30 m chart is missing");

        // points[0] is not used at 21 m; corrupting it must not poison the basis.
        chart.points[0].capacityT.provenance = {
            kind: "source",
            sourceId: "missing-source",
        };

        const basis = mapCapacityBasis(crane, 30, [21]);

        expect(basis.status).toBe("VERIFIED");
        expect(basis.page).toBe(3);
        expect(basis.note).toContain("21 m");
        expect(basis.note).toContain("20 m (3.9 t) and 22 m (3.5 t)");
    });

    test("mixed chart-point provenance used by a pick is NOT_STATED", () => {
        const crane = structuredClone(MCT85F5);
        const chart = crane.loadChart?.find((row) => row.jibM.value === 30);
        if (!chart) throw new Error("MCT85F5 30 m chart is missing");

        // A pick at 21 m uses the 20 m and 22 m points. Give the 20 m point a
        // different but otherwise valid source; the basis must not claim one
        // VERIFIED attribution for a capacity derived from both.
        chart.points[2].radiusM.provenance = {
            kind: "source",
            sourceId: "datasheetOverview",
        };
        chart.points[2].capacityT.provenance = {
            kind: "source",
            sourceId: "datasheetOverview",
        };

        const basis = mapCapacityBasis(crane, 30, [21]);

        expect(basis.status).toBe("NOT_STATED");
        expect(basis.note).toContain("different provenance");
    });

    test("the snapshot capacity basis uses the pick radius, not points[0]", () => {
        const crane = structuredClone(MCT85F5);
        const chart = crane.loadChart?.find((row) => row.jibM.value === 30);
        if (!chart) throw new Error("MCT85F5 30 m chart is missing");

        chart.points[0].capacityT.provenance = {
            kind: "source",
            sourceId: "missing-source",
        };

        const snapshot = buildTowerReportSnapshot(
            stateForCrane(
                crane,
                {
                    value: 30,
                    provenance: { kind: "source", sourceId: "datasheetLoadCharts" },
                },
                {
                    craneEvaluation: evaluation({
                        craneId: crane.id,
                        craneName: crane.name,
                        jibM: 30,
                        picks: [
                            pick({
                                craneId: crane.id,
                                craneName: crane.name,
                                jibM: 30,
                                radiusM: 21,
                                capacityT: 3.5,
                                utilisationPct: 28.6,
                            }),
                        ],
                        allPass: true,
                        failedCount: 0,
                    }),
                },
            ),
        );
        const basis = findSource(snapshot, "Capacity basis");

        expect(basis.status).toBe("VERIFIED");
        expect(basis.note).toContain("20 m (3.9 t) and 22 m (3.5 t)");
    });

    test("capacity provenance ignores picks with no supplied capacity", () => {
        const snapshot = buildTowerReportSnapshot(
            stateForCrane(
                MCT85F5,
                {
                    value: 30,
                    provenance: { kind: "source", sourceId: "datasheetLoadCharts" },
                },
                {
                    craneEvaluation: evaluation({
                        craneId: MCT85F5.id,
                        craneName: MCT85F5.name,
                        jibM: 30,
                        picks: [
                            pick({
                                craneId: MCT85F5.id,
                                craneName: MCT85F5.name,
                                jibM: 30,
                                radiusM: 21,
                                capacityT: null,
                                utilisationPct: null,
                                status: "OUT_OF_RANGE",
                            }),
                            pick({
                                craneId: MCT85F5.id,
                                craneName: MCT85F5.name,
                                jibM: 30,
                                radiusM: 24,
                                capacityT: 3.2,
                                utilisationPct: 31.25,
                                status: "PASS",
                            }),
                        ],
                        allPass: false,
                        failedCount: 1,
                    }),
                },
            ),
        );

        const basis = findSource(snapshot, "Capacity basis");

        expect(snapshot.verdict).toBe("INCOMPLETE");
        expect(basis.status).toBe("VERIFIED");
        expect(basis.note).toContain("24 m");
        expect(basis.note).not.toContain("21 m");
    });

    test("a capacity basis is NOT_STATED when no pick has a published capacity", () => {
        const snapshot = buildTowerReportSnapshot(
            stateForCrane(
                MCT85F5,
                {
                    value: 30,
                    provenance: { kind: "source", sourceId: "datasheetLoadCharts" },
                },
                {
                    craneEvaluation: evaluation({
                        craneId: MCT85F5.id,
                        craneName: MCT85F5.name,
                        jibM: 30,
                        picks: [
                            pick({
                                craneId: MCT85F5.id,
                                craneName: MCT85F5.name,
                                jibM: 30,
                                radiusM: 21,
                                capacityT: null,
                                utilisationPct: null,
                                status: "OUT_OF_RANGE",
                            }),
                        ],
                        allPass: false,
                        failedCount: 1,
                    }),
                },
            ),
        );

        const basis = findSource(snapshot, "Capacity basis");

        expect(snapshot.verdict).toBe("INCOMPLETE");
        expect(basis.status).toBe("NOT_STATED");
        expect(basis.note).toContain("finite capacity");
        expect(basis.note).not.toContain("21 m");
    });

    test.each([
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        "3",
        "N/A",
        "unknown",
        "",
        "   ",
        undefined,
        null,
    ])("source page %s is NOT_STATED", (page) => {
        const result = mapSourcedNumber(
            "Value",
            { value: 1, provenance: { kind: "source", sourceId: "doc" } },
            { doc: documentWithPage(page) },
        );

        expect(result.status).toBe("NOT_STATED");
    });

    test("a positive integer source page is VERIFIED", () => {
        const result = mapSourcedNumber(
            "Value",
            { value: 1, provenance: { kind: "source", sourceId: "doc" } },
            { doc: { document: "Test document", page: 3 } },
        );

        expect(result).toMatchObject({
            status: "VERIFIED",
            document: "Test document",
            page: 3,
        });
    });

    test.each([
        0,
        -1,
        1.5,
        "3",
        "N/A",
        "unknown",
        "",
        "   ",
        undefined,
        null,
    ])("sourced dimension page %s is NOT_STATED", (page) => {
        const dimension = {
            value: 1,
            source: { kind: "sourced", document: "Test document", page },
        } as unknown as CraneDimension;

        expect(mapCraneDimension("Dimension", dimension).status).toBe("NOT_STATED");
    });

    test.each([
        0,
        -1,
        1.5,
        "3",
        "N/A",
        "unknown",
        "",
        "   ",
        undefined,
        null,
    ])("site source page %s is NOT_STATED", (page) => {
        expect(mapSiteProvenance(siteProvenanceWithPage(page)).status).toBe("NOT_STATED");
    });

    test("blank INDICATIVE and LEGACY evidence is NOT_STATED", () => {
        const indicativeNumber: SourcedNumber = {
            value: 1,
            provenance: { kind: "indicative", basis: "   " },
        };
        expect(mapSourcedNumber("Value", indicativeNumber, {}).status).toBe("NOT_STATED");

        const indicativeDimension: CraneDimension = {
            value: 1,
            source: { kind: "indicative", note: "" },
        };
        expect(mapCraneDimension("Dimension", indicativeDimension).status).toBe("NOT_STATED");

        expect(mapSiteProvenance({ kind: "indicative", basis: "" }).status).toBe("NOT_STATED");
        expect(mapSiteProvenance({ kind: "legacy", note: "   " }).status).toBe("NOT_STATED");
    });

    test("missing nested provenance returns NOT_STATED instead of throwing", () => {
        const valueWithoutProvenance = { value: 1 } as unknown as SourcedNumber;
        expect(mapSourcedNumber("Value", valueWithoutProvenance, {}).status).toBe("NOT_STATED");

        const dimensionWithoutSource = { value: 1 } as unknown as CraneDimension;
        expect(mapCraneDimension("Dimension", dimensionWithoutSource).status).toBe("NOT_STATED");

        expect(mapSiteProvenance(undefined).status).toBe("NOT_STATED");
        expect(mapSiteProvenance({ kind: "unknown" } as unknown as TowerPlanSiteProvenance).status).toBe(
            "NOT_STATED",
        );

        const parameters = createDefaultHeightParameters();
        (parameters.hookHeight as unknown as { source?: unknown }).source = undefined;

        const snapshot = buildTowerReportSnapshot(makeState({ heightParameters: parameters }));

        expect(snapshot.heightParameters.hookHeight.value).toBe(80);
        expect(snapshot.heightParameters.hookHeight.source).toBeUndefined();
        expect(findSource(snapshot, "Hook height (available)").status).toBe("NOT_STATED");
    });

    test("an inherited source id is NOT_STATED, never VERIFIED", () => {
        const inherited = Object.create({
            inherited: { document: "Inherited document", page: 1 },
        }) as Record<string, SourceDocument>;
        const value: SourcedNumber = {
            value: 1,
            provenance: { kind: "source", sourceId: "inherited" },
        };

        expect(mapSourcedNumber("Value", value, inherited).status).toBe("NOT_STATED");
    });

    test("missing provenance is preserved as missing, not fabricated as INDICATIVE", () => {
        const crane = structuredClone(MCT88);
        delete (crane.maxCapacityT as { provenance?: SourcedNumber["provenance"] }).provenance;

        const snapshot = buildTowerReportSnapshot(makeState({ crane }));

        expect(snapshot.crane.maxCapacityT.provenance).toBeUndefined();
        expect(findSource(snapshot, "Crane maximum capacity").status).toBe("NOT_STATED");
    });

    test("NotStated dimensions are preserved with their reason", () => {
        const crane = structuredClone(MCT88);
        const reason = "The inspected datasheet does not state the mast width.";
        crane.dimensions.mastWidthM = { kind: "notStated", reason };

        const snapshot = buildTowerReportSnapshot(makeState({ crane }));

        expect(snapshot.crane.dimensions.mastWidthM).toEqual({ kind: "notStated", reason });
        expect(snapshot.crane.dimensions.baseWidthM).toEqual(crane.dimensions.baseWidthM);
        expect(snapshot.crane.dimensions.counterJibRadiusM).toEqual(crane.dimensions.counterJibRadiusM);
        expect(findSource(snapshot, "Mast width")).toMatchObject({ status: "NOT_STATED", note: reason });
    });

    test("a NotStated heaviest erection component is preserved with its reason", () => {
        const crane = structuredClone(MCT88);
        const reason = "No individual erection-component mass is published.";
        crane.heaviestErectionComponent = { kind: "notStated", reason };

        const snapshot = buildTowerReportSnapshot(makeState({ crane }));

        expect(snapshot.crane.heaviestErectionComponent).toEqual({ kind: "notStated", reason });
        expect(findSource(snapshot, "Heaviest erection component mass")).toMatchObject({
            status: "NOT_STATED",
            note: reason,
        });
    });

    test("malformed chart, tip-load and site containers are guarded", () => {
        const chartCrane = structuredClone(MCT85F5) as unknown as TowerCrane & {
            loadChart: Array<unknown>;
        };
        chartCrane.loadChart.push(null);
        const chartSnapshot = buildTowerReportSnapshot(
            stateForCrane(chartCrane as TowerCrane, {
                value: 30,
                provenance: { kind: "source", sourceId: "datasheetLoadCharts" },
            }),
        );
        expect(chartSnapshot.crane.loadChart).toHaveLength(MCT85F5.loadChart?.length ?? 0);
        expect(chartSnapshot.verdict).toBe("PASS");

        const malformedChart = structuredClone(MCT85F5);
        const chart = malformedChart.loadChart?.[2];
        if (!chart) throw new Error("MCT85F5 chart is missing");
        (chart.points as LoadChartPoint[])[0] = null as unknown as LoadChartPoint;
        expect(mapCapacityBasis(malformedChart, 30).status).toBe("NOT_STATED");

        const tipCrane = structuredClone(MCT88) as unknown as TowerCrane & {
            tipLoadByJib: Array<unknown>;
        };
        tipCrane.tipLoadByJib.push(null);
        const tipSnapshot = buildTowerReportSnapshot(makeState({ crane: tipCrane as TowerCrane }));
        expect(tipSnapshot.crane.tipLoadByJib).toHaveLength(MCT88.tipLoadByJib.length);
        expect(tipSnapshot.verdict).toBe("PASS");

        const malformedSite = {
            boundary: {},
            neighbours: [],
            noGoZones: [],
        } as unknown as OversailSite;
        const siteSnapshot = buildTowerReportSnapshot(makeState({ site: malformedSite }));
        expect(siteSnapshot.site).toBeNull();
        expect(siteSnapshot.verdict).toBe("INCOMPLETE");
        expect(siteSnapshot.notChecked).toContainEqual(expect.objectContaining({ item: "Site model" }));
    });

    test("site boundaries need at least three finite points", () => {
        const cases: ReadonlyArray<{ name: string; polygon: readonly unknown[] }> = [
            {
                name: "fewer than three points",
                polygon: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
            },
            { name: "a null point", polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, null] },
            {
                name: "a non-finite x coordinate",
                polygon: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: Number.NaN, y: 10 },
                ],
            },
            {
                name: "a non-finite y coordinate",
                polygon: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 0, y: Number.POSITIVE_INFINITY },
                ],
            },
        ];

        for (const item of cases) {
            const site = {
                boundary: { polygon: item.polygon, source: "test boundary" },
                neighbours: [],
                noGoZones: [],
            } as unknown as OversailSite;

            const snapshot = buildTowerReportSnapshot(makeState({ site }));

            expect(snapshot.site).toBeNull();
            expect(snapshot.verdict).toBe("INCOMPLETE");
            expect(snapshot.notChecked).toContainEqual(expect.objectContaining({ item: "Site model" }));
        }
    });

    test("30 m remains 30 m in the snapshot", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                placement: { x: 30, y: 40, slewAngleDeg: 0 },
                jibM: { value: 30, provenance: { kind: "indicative", basis: "30 m test jib" } },
                craneEvaluation: evaluation({
                    picks: [pick({ radiusM: 30 })],
                }),
            }),
        );

        expect(snapshot.jibM).toBe(30);
        expect(snapshot.placement.x).toBe(30);
        expect(snapshot.picks[0].radiusM).toBe(30);
        expect(snapshot.jibM).not.toBe(30_000);
    });

    test("all non-pass pick, T8 and T9 outcomes remain visible", () => {
        const oversail: OversailReport = {
            overallStatus: "permission_needed",
            results: [
                {
                    id: "boundary",
                    kind: "boundary",
                    label: "Site boundary",
                    status: "pass",
                    oversailDepthM: 0,
                    message: "No oversail of site boundary.",
                },
                {
                    id: "power_line",
                    kind: "power_line",
                    label: "Power line",
                    status: "permission_needed",
                    oversailDepthM: 0,
                    message: "Permission required from the electricity authority.",
                },
            ],
        };
        const height: HeightCheckReport = {
            ...passingHeight(),
            overallStatus: "tie_in_required",
            tieInRequired: true,
            tieInLevelsM: [50],
            results: [
                {
                    id: "hook_height",
                    kind: "hook_height",
                    label: "Hook height",
                    status: "pass",
                    message: "Hook height OK.",
                },
                {
                    id: "freestanding",
                    kind: "freestanding",
                    label: "Freestanding height",
                    status: "tie_in_required",
                    message: "Tie-in required.",
                },
            ],
        };

        const snapshot = buildTowerReportSnapshot(
            makeState({
                craneEvaluation: evaluation({
                    picks: [pick({ label: "P1", status: "FAIL" })],
                    allPass: false,
                    failedCount: 1,
                }),
                oversailReport: oversail,
                heightReport: height,
            }),
        );

        expect(snapshot.picks[0].status).toBe("FAIL");
        expect(findResult(snapshot.oversail?.results, "power_line").status).toBe("WARN");
        expect(findResult(snapshot.height?.results, "freestanding").status).toBe("WARN");
        expect(snapshot.failedChecks.map((item) => item.id)).toEqual(
            expect.arrayContaining(["pick-1", "power_line", "freestanding"]),
        );
        expect(snapshot.verdict).toBe("FAIL");
    });

    test("uses the fixed date and author supplied by the caller", () => {
        const snapshot = buildTowerReportSnapshot(
            makeState({
                metadata: {
                    projectName: "Fixed Metadata Project",
                    date: "2020-01-02",
                    author: "A. Engineer",
                },
            }),
        );

        expect(snapshot.metadata).toMatchObject({
            projectName: "Fixed Metadata Project",
            date: "2020-01-02",
            author: "A. Engineer",
        });
    });

    test("hand-worked T8 power-line result is preserved", () => {
        // Hand-worked: mast (30, 40), line x = -9, so available = 30 + 9 = 39 m.
        // Required = radius 40 + clearance 6 = 46 m -> shortfall 46 - 39 = 7.0 m.
        const site: OversailSite = {
            boundary: { polygon: rect(-1000, -1000, 1000, 1000), source: "test boundary" },
            neighbours: [],
            noGoZones: [],
            powerLine: {
                xM: -9,
                clearanceM: 6,
                voltageKv: 22,
                sourceNote: "INDICATIVE test source",
                indicative: true,
            },
        };
        const report = evaluateOversailChecks({
            mast: { x: 30, y: 40 },
            swingRadiusM: 40,
            site,
        });

        const snapshot = buildTowerReportSnapshot(
            makeState({
                site,
                siteProvenance: { kind: "legacy", note: "Synthetic test site" },
                oversailReport: report,
            }),
        );
        const power = findResult(snapshot.oversail?.results, "power_line");

        expect(power.status).toBe("FAIL");
        expect(power.availableM).toBeCloseTo(39, 10);
        expect(power.requiredM).toBeCloseTo(46, 10);
        expect(power.message).toContain("Power line clearance short by 7.0 m");
        expect(snapshot.failedChecks).toContainEqual(
            expect.objectContaining({ id: "power_line", status: "FAIL", requiredM: 46, availableM: 39 }),
        );
    });

    test("status helpers preserve missing and incomplete outcomes", () => {
        expect(toMetricStatus("PASS")).toBe("PASS");
        expect(toMetricStatus("FAIL")).toBe("FAIL");
        expect(toMetricStatus("permission_needed")).toBe("WARN");
        expect(toMetricStatus("tie_in_required")).toBe("WARN");
        expect(toMetricStatus("unavailable")).toBe("NOT_CHECKED");
        expect(toMetricStatus("OUT_OF_RANGE")).toBe("OUT_OF_RANGE");
        expect(toMetricStatus("UNSUPPORTED")).toBe("UNSUPPORTED");
        expect(toMetricStatus("INVALID")).toBe("INVALID");
        expect(toMetricStatus(undefined)).toBe("NOT_CHECKED");

        expect(verdictFromStatuses(["PASS", "PASS"])).toBe("PASS");
        expect(verdictFromStatuses(["PASS", "WARN"])).toBe("WARN");
        expect(verdictFromStatuses(["PASS", "NOT_CHECKED"])).toBe("INCOMPLETE");
        expect(verdictFromStatuses(["PASS", "OUT_OF_RANGE"])).toBe("INCOMPLETE");
        expect(verdictFromStatuses(["PASS", "UNSUPPORTED"])).toBe("INCOMPLETE");
        expect(verdictFromStatuses(["PASS", "INVALID"])).toBe("INCOMPLETE");
        expect(verdictFromStatuses(["PASS", "INFO"])).toBe("INCOMPLETE");
        expect(verdictFromStatuses(["WARN", "NOT_CHECKED"])).toBe("INCOMPLETE");
        expect(verdictFromStatuses(["PASS", "FAIL", "NOT_CHECKED"])).toBe("FAIL");
        expect(verdictFromStatuses([])).toBe("INCOMPLETE");
    });

    test("the simulated wind rule is disclosed as an operational assumption", () => {
        const snapshot = buildTowerReportSnapshot(makeState({ windKmh: 25 }));

        expect(snapshot.assumptions).toContainEqual({
            category: "operational",
            description: WIND_DERATE_RULE.note,
        });
    });

    test("the snapshot is deterministic", () => {
        const state = makeState({ site: structuredClone(SITE) });
        const first = buildTowerReportSnapshot(state);
        const second = buildTowerReportSnapshot(state);

        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
        expect(first).not.toBe(second);
        expect(first.site).not.toBe(second.site);
        expect(first.crane).not.toBe(second.crane);
    });

    test("mutating the input after building does not change the snapshot", () => {
        const state = makeState({
            site: structuredClone(SITE),
            crane: structuredClone(MCT88),
        });
        const snapshot = buildTowerReportSnapshot(state);
        const snapshotJson = JSON.stringify(snapshot);

        const site = state.site;
        if (!site) throw new Error("test site is missing");
        site.boundary.polygon[0].x = -999;
        (site.noGoZones as OversailNoGoZone[]).push({
            id: "added",
            label: "Added",
            center: { x: 1, y: 2 },
            radiusM: 3,
        });
        state.crane.tipLoadByJib[0].tipT.value = 999;
        state.heightParameters.hookHeight.value = 999;
        state.craneEvaluation.picks[0].label = "mutated";
        (state.craneEvaluation.picks as TowerPlanPickEvaluation[]).push(pick({ label: "added" }));
        if (state.heightReport) {
            (state.heightReport.errors as string[]).push("mutated");
            (state.heightReport.tieInLevelsM as number[]).push(99);
        }
        (state.notes as string[]).push("mutated");
        (state.assumptions as { category: "general"; description: string }[])[0].description = "mutated";

        expect(JSON.stringify(snapshot)).toBe(snapshotJson);
    });

    test("mutating the snapshot after building does not change the input", () => {
        const state = makeState({
            site: structuredClone(SITE),
            crane: structuredClone(MCT88),
        });
        const snapshot = buildTowerReportSnapshot(state);
        const stateJson = JSON.stringify(state);

        const site = snapshot.site;
        if (!site) throw new Error("snapshot site is missing");
        site.boundary.polygon[0].x = 12345;
        snapshot.crane.tipLoadByJib[0].tipT.value = 12345;
        snapshot.heightParameters.hookHeight.value = 12345;
        if (snapshot.height) {
            (snapshot.height.errors as string[]).push("mutated");
            (snapshot.height.tieInLevelsM as number[]).push(99);
        }
        (snapshot.notes as string[]).push("mutated");
        (snapshot.picks[0] as { label: string }).label = "mutated";

        expect(JSON.stringify(state)).toBe(stateJson);
    });

    test("load-chart points are copied, not aliased", () => {
        const state = stateForCrane(structuredClone(MCT85F5), {
            value: 30,
            provenance: { kind: "source", sourceId: "datasheetLoadCharts" },
        });
        const snapshot = buildTowerReportSnapshot(state);
        const stateJson = JSON.stringify(state);
        const point = snapshot.crane.loadChart?.[0]?.points[0];
        if (!point) throw new Error("MCT85F5 load-chart point is missing");

        point.capacityT.value = 999;

        expect(JSON.stringify(state)).toBe(stateJson);
    });
});
