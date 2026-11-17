// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import type { ReportData, ReportMetric, ReportSection } from "../../site-model/src/report";
import { MCT88 } from "../src/catalogue";
import type { CraneDimension } from "../src/model/cranePlacement";
import type { HeightCheckReport, HeightParameters } from "../src/model/heightTypes";
import type { OversailReport, OversailSite } from "../src/model/oversailTypes";
import type {
    TowerPlanCraneEvaluation,
    TowerPlanPickEvaluation,
    TowerPlanState,
} from "../src/model/towerPlanState";
import { buildTowerReportData } from "../src/report/towerReportAdapter";
import { buildTowerReportSnapshot } from "../src/report/towerReportSnapshot";
import type { TowerReportSnapshot } from "../src/report/towerReportTypes";

/*
 * HAND-WORKED SANITY CHECK (fixture values, not catalogue data):
 *
 * P1: 2 t load / 5 t published capacity = 40% -> PASS.
 * The fixture deliberately uses 2 t and 5 t so the utilisation can be verified
 * by hand. No capacity, T8 or T9 calculation is performed by these tests.
 */

const T9_SOURCE_ITEMS = [
    "Hook height (available)",
    "Hook clearance",
    "Freestanding height",
    "Tie-in spacing",
] as const;

const SITE: OversailSite = {
    boundary: {
        polygon: [
            { x: -100, y: -100 },
            { x: 100, y: -100 },
            { x: 100, y: 100 },
            { x: -100, y: 100 },
        ],
        source: "Synthetic optional-contract site",
    },
    neighbours: [],
    noGoZones: [],
};

function dimension(value: number): CraneDimension {
    return { value, source: { kind: "indicative", note: "Optional-contract test fixture." } };
}

const HEIGHT_PARAMETERS: HeightParameters = {
    hookHeight: dimension(72),
    hookClearance: dimension(3),
    freestandingHeight: dimension(55),
    tieInSpacing: dimension(24),
};

function pick(overrides: Partial<TowerPlanPickEvaluation> = {}): TowerPlanPickEvaluation {
    return {
        craneId: MCT88.id,
        craneName: MCT88.name,
        label: "P1",
        jibM: 30,
        loadT: 2,
        radiusM: 20,
        windKmh: null,
        capacityT: 5,
        utilisationPct: 40,
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
                message: "No oversail of the site boundary.",
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
                requiredM: 60,
                availableM: 72,
            },
        ],
        overallStatus: "pass",
        tieInRequired: false,
        tieInLevelsM: [],
    };
}

function baseState(overrides: Partial<TowerPlanState> = {}): TowerPlanState {
    return {
        metadata: {
            projectName: "T10 Optional Contract",
            siteLocation: "Test Site",
            date: "2026-11-14",
            author: "Test Engineer",
        },
        site: SITE,
        siteProvenance: { kind: "legacy", note: "Synthetic optional-contract site" },
        crane: MCT88,
        placement: { x: 12.5, y: -3.25 },
        jibM: { value: 30, provenance: { kind: "indicative", basis: "Test jib selection" } },
        windKmh: null,
        craneEvaluation: evaluation(),
        oversailReport: passingOversail(),
        heightReport: null,
        ...overrides,
    };
}

function findSection(data: ReportData, id: string): ReportSection {
    const found = data.sections.find((section) => section.id === id);
    if (!found) throw new Error(`Missing report section '${id}'.`);
    return found;
}

function findMetric(section: ReportSection, label: string): ReportMetric {
    const found = section.metrics?.find((metric) => metric.label === label);
    if (!found) throw new Error(`Missing metric '${label}' in section '${section.id}'.`);
    return found;
}

function sectionMetricLabels(section: ReportSection): string[] {
    return (section.metrics ?? []).map((metric) => metric.label);
}

function sourceItems(snapshot: TowerReportSnapshot): string[] {
    return snapshot.sources.map((source) => source.item);
}

describe("T10 optional report contract for Pick Check-only reports", () => {
    test("keeps finite mast X/Y and represents an absent slew without inventing one", () => {
        const snapshot = buildTowerReportSnapshot(baseState({ placement: { x: 12.5, y: -3.25 } }));

        expect(snapshot.placement.x).toBe(12.5);
        expect(snapshot.placement.y).toBe(-3.25);
        expect("slewAngleDeg" in snapshot.placement).toBe(false);
        expect(snapshot.placement.slewAngleDeg).toBeUndefined();
    });

    test("adapter discloses a not-evaluated slew and does not render a fabricated numeric value", () => {
        const data = buildTowerReportData(
            buildTowerReportSnapshot(baseState({ placement: { x: 12.5, y: -3.25 } })),
        );
        const slew = findMetric(findSection(data, "crane-configuration"), "Slew angle");

        expect(slew.value).toBeNull();
        expect(slew.value).not.toBe(0);
        expect(slew.unit).toBeUndefined();
        expect(slew.notes).toContain("Not evaluated");
        expect(slew.notes).toContain("No default or numeric value is inferred");
        expect(slew.status).toBeUndefined();
    });

    test("omits height parameters, planned-height metrics and T9 source entries when T9 did not run", () => {
        const state = baseState({ heightReport: null });
        const snapshot = buildTowerReportSnapshot(state);
        const data = buildTowerReportData(snapshot);
        const heightSection = findSection(data, "height-tie-in");

        expect(state.heightParameters).toBeUndefined();
        expect(snapshot.height).toBeNull();
        expect("heightParameters" in snapshot).toBe(false);
        expect(snapshot.heightParameters).toBeUndefined();

        for (const item of T9_SOURCE_ITEMS) {
            expect(sourceItems(snapshot)).not.toContain(item);
        }

        const sourceNotes = findSection(data, "source-notes");
        const sourceNoteItems = (sourceNotes.rows ?? []).map((row) => row.cells.item);
        for (const item of T9_SOURCE_ITEMS) {
            expect(sourceNoteItems).not.toContain(item);
        }

        expect(sectionMetricLabels(heightSection)).not.toContain("Hook height");
        expect(sectionMetricLabels(heightSection)).not.toContain("Hook clearance");
        expect(sectionMetricLabels(heightSection)).not.toContain("Freestanding height");
        expect(sectionMetricLabels(heightSection)).not.toContain("Tie-in spacing");
        expect(heightSection.metrics ?? []).toEqual([]);
        expect(heightSection.description).toContain("no planned height parameters were recorded");
    });

    test("keeps the T9 not-performed disclosure when height parameters and the T9 report are absent", () => {
        const snapshot = buildTowerReportSnapshot(baseState({ heightReport: null }));
        const data = buildTowerReportData(snapshot);

        expect(snapshot.notChecked).toContainEqual({
            item: "Height and tie-in checks (T9)",
            reason: "No T9 height report was supplied.",
        });

        const notPerformed = findSection(data, "checks-not-performed");
        const notPerformedItems = (notPerformed.rows ?? []).map((row) => row.cells.item);
        expect(notPerformedItems).toContain("Height and tie-in checks (T9)");
        expect(snapshot.verdict).toBe("INCOMPLETE");
    });

    test("preserves existing full-report behaviour when slew and T9 parameters are supplied", () => {
        const state = baseState({
            placement: { x: 30, y: 40, slewAngleDeg: 90 },
            heightReport: passingHeight(),
            heightParameters: HEIGHT_PARAMETERS,
        });
        const snapshot = buildTowerReportSnapshot(state);
        const data = buildTowerReportData(snapshot);
        const craneSection = findSection(data, "crane-configuration");
        const heightSection = findSection(data, "height-tie-in");

        expect(snapshot.placement.slewAngleDeg).toBe(90);
        expect(snapshot.heightParameters).toEqual(HEIGHT_PARAMETERS);
        expect(snapshot.height?.parameters).toEqual(HEIGHT_PARAMETERS);
        expect(snapshot.verdict).toBe("PASS");
        expect(snapshot.notChecked.some((entry) => entry.item.includes("(T9)"))).toBe(false);

        for (const item of T9_SOURCE_ITEMS) {
            expect(sourceItems(snapshot)).toContain(item);
        }

        const slew = findMetric(craneSection, "Slew angle");
        expect(slew.value).toBe(90);
        expect(slew.unit).toBe("°");
        expect(slew.notes).toBeUndefined();

        expect(findMetric(heightSection, "Hook height").value).toBe(72);
        expect(findMetric(heightSection, "Hook clearance").value).toBe(3);
        expect(findMetric(heightSection, "Freestanding height").value).toBe(55);
        expect(findMetric(heightSection, "Tie-in spacing").value).toBe(24);
        expect(findMetric(heightSection, "Overall T9 result").value).toBe("PASS");
    });

    test("keeps a supplied T9 report but discloses absent parameters instead of inventing planned values", () => {
        const state = baseState({ heightReport: passingHeight(), heightParameters: undefined });
        const snapshot = buildTowerReportSnapshot(state);
        const data = buildTowerReportData(snapshot);
        const heightSection = findSection(data, "height-tie-in");

        expect(snapshot.height).not.toBeNull();
        expect(snapshot.height?.overallStatus).toBe("PASS");
        expect(snapshot.height?.parameters).toBeUndefined();
        expect("heightParameters" in snapshot).toBe(false);

        for (const item of T9_SOURCE_ITEMS) {
            expect(sourceItems(snapshot)).not.toContain(item);
        }

        expect(sectionMetricLabels(heightSection)).toContain("Overall T9 result");
        expect(sectionMetricLabels(heightSection)).not.toContain("Hook height");
        expect(sectionMetricLabels(heightSection)).not.toContain("Hook clearance");
        expect(sectionMetricLabels(heightSection)).not.toContain("Freestanding height");
        expect(sectionMetricLabels(heightSection)).not.toContain("Tie-in spacing");

        const disclosure = findMetric(heightSection, "Planned height parameters");
        expect(disclosure.value).toBeNull();
        expect(disclosure.notes).toContain("without planned height parameters");
        expect(disclosure.notes).toContain("planned-height values are not shown");
        expect(heightSection.description).toContain("without planned height parameters");

        expect(snapshot.verdict).toBe("PASS");
        expect(snapshot.notChecked.some((entry) => entry.item.includes("(T9)"))).toBe(false);
    });
});
