// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import {
    generateReportHtml,
    type ReportData,
    type ReportMetric,
    type ReportSection,
    validateReportData,
} from "../../site-model/src/report";
import { REQUIRED_DISCLAIMER } from "../../site-model/src/types";
import { MCT88 } from "../src/catalogue";
import type { CraneEvaluation, Pick, PickEvaluation } from "../src/pickEngine";
import {
    buildTowerPickPlanState,
    buildTowerPickReport,
    isTowerPickReportDate,
    normalizeTowerPickReportMetadata,
    type TowerPickReportMetadata,
    validateTowerPickReportMetadata,
} from "../src/report/towerPickReport";
import {
    capturePickCheckSession,
    type PickCheckSession,
    type PickCheckSessionDraft,
} from "../src/report/towerPickSession";

/*
 * HAND-WORKED SANITY CHECK (fixture values, not catalogue data):
 *
 * The captured P1 is a 2 t load at a 20 m radius with a supplied capacity of
 * 99.9 t, so its supplied utilisation is 2.0%. Those values deliberately do not
 * match a catalogue chart: the report must copy them unchanged and must not
 * recalculate. Site, T8 and T9 are absent, so the verdict must be INCOMPLETE,
 * never PASS.
 */

const METADATA: TowerPickReportMetadata = {
    projectName: "Harbour Project",
    siteLocation: "North Quay",
    date: "2026-11-16",
    author: "Test Engineer",
};

const PICK: Pick = {
    label: "P1",
    loadT: 2,
    supply: { x: 20, y: 0 },
    drop: { x: 0, y: 20 },
};

const PICK_EVALUATION: PickEvaluation = {
    craneId: MCT88.id,
    craneName: MCT88.name,
    label: "P1",
    jibM: MCT88.defaultJibM.value,
    loadT: 2,
    radiusM: 20,
    supplyRadiusM: 20,
    dropRadiusM: 20,
    governing: "supply",
    windKmh: null,
    capacityT: 99.9,
    utilisationPct: 2,
    status: "PASS",
};

const EVALUATION: CraneEvaluation = {
    craneId: MCT88.id,
    craneName: MCT88.name,
    jibM: MCT88.defaultJibM.value,
    windKmh: null,
    picks: [PICK_EVALUATION],
    allPass: true,
    failedCount: 0,
    unsupported: false,
};

function draft(overrides: Partial<PickCheckSessionDraft> = {}): PickCheckSessionDraft {
    return {
        crane: MCT88,
        jibM: MCT88.defaultJibM.value,
        windKmh: null,
        mast: { x: 0, y: 0 },
        picks: [PICK],
        evaluation: EVALUATION,
        ...overrides,
    };
}

function capturedSession(): PickCheckSession {
    const document = new TestDocument();
    const session = capturePickCheckSession(document, draft());
    if (session === undefined) throw new Error("The test fixture session was not captured.");
    return session;
}

function findSection(data: ReportData, id: string): ReportSection {
    const section = data.sections.find((candidate) => candidate.id === id);
    if (section === undefined) throw new Error(`Missing report section '${id}'.`);
    return section;
}

function findMetric(section: ReportSection, label: string): ReportMetric {
    const metric = section.metrics?.find((candidate) => candidate.label === label);
    if (metric === undefined) throw new Error(`Missing metric '${label}' in '${section.id}'.`);
    return metric;
}

function notCheckedItems(data: ReportData): string[] {
    const section = findSection(data, "checks-not-performed");
    return (section.rows ?? []).map((row) => String(row.cells.item));
}

function decodeDataUrl(dataUrl: string | undefined): string {
    if (dataUrl === undefined) throw new Error("plan-view data URL is missing");
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("plan-view data URL has no payload");
    return decodeURIComponent(dataUrl.slice(comma + 1));
}

describe("Tower Pick Check report metadata", () => {
    test("accepts complete metadata and a real calendar date", () => {
        expect(isTowerPickReportDate("2026-11-16")).toBe(true);
        expect(isTowerPickReportDate("2028-02-29")).toBe(true);
        expect(validateTowerPickReportMetadata(METADATA)).toBeUndefined();
    });

    test.each([
        "",
        "   ",
        "2026-1-1",
        "16-11-2026",
        "2026-13-01",
        "2026-02-30",
        "2027-02-29",
    ])("rejects the date %s", (date) => {
        expect(isTowerPickReportDate(date)).toBe(false);
        expect(validateTowerPickReportMetadata({ ...METADATA, date })).toBe("date");
    });

    test("requires a project and an author", () => {
        expect(validateTowerPickReportMetadata({ ...METADATA, projectName: "   " })).toBe("project");
        expect(validateTowerPickReportMetadata({ ...METADATA, author: "   " })).toBe("author");
    });

    test("trims text and omits a blank optional site location", () => {
        const normalized = normalizeTowerPickReportMetadata({
            projectName: "  Harbour Project  ",
            author: "  Test Engineer ",
            date: " 2026-11-16 ",
            siteLocation: "   ",
        });

        expect(normalized).toEqual({
            projectName: "Harbour Project",
            author: "Test Engineer",
            date: "2026-11-16",
        });
        expect("siteLocation" in normalized).toBe(false);
    });
});

describe("captured Pick Check to report state", () => {
    test("copies captured values without recalculating and omits unavailable inputs", () => {
        const session = capturedSession();
        const state = buildTowerPickPlanState(session, METADATA);

        expect(state.metadata).toEqual(METADATA);
        expect(state.site).toBeNull();
        expect(state.siteProvenance).toEqual({ kind: "not_stated" });
        expect(state.crane.id).toBe(MCT88.id);
        expect(state.placement).toEqual({ x: 0, y: 0 });
        expect("slewAngleDeg" in state.placement).toBe(false);
        expect(state.jibM).toEqual(session.jibM);
        expect(state.windKmh).toBeNull();
        expect(state.craneEvaluation).toEqual(session.evaluation);
        expect(state.craneEvaluation.picks[0].capacityT).toBe(99.9);
        expect(state.craneEvaluation.picks[0].utilisationPct).toBe(2);
        expect(state.pickCoordinates).toEqual([{ supply: { x: 20, y: 0 }, drop: { x: 0, y: 20 } }]);
        expect(state.oversailReport).toBeNull();
        expect(state.heightReport).toBeNull();
        expect("heightParameters" in state).toBe(false);
    });

    test("rejects invalid metadata before a report state can be built", () => {
        const session = capturedSession();

        expect(() => buildTowerPickPlanState(session, { ...METADATA, author: "" })).toThrow(
            "Tower pick report metadata is invalid: author",
        );
        expect(() => buildTowerPickPlanState(session, { ...METADATA, date: "2026-02-30" })).toThrow(
            "Tower pick report metadata is invalid: date",
        );
    });
});

describe("captured Pick Check to S7 report data", () => {
    test("passes the snapshot through the S7 adapter with the captured pick values", () => {
        const data = buildTowerPickReport(capturedSession(), METADATA);

        expect(data.metadata).toEqual({
            title: "Tower Crane Lift Plan",
            projectName: "Harbour Project",
            siteLocation: "North Quay",
            date: "2026-11-16",
            author: "Test Engineer",
            product: "tower-planner",
        });
        expect(data.verdict?.status).toBe("INCOMPLETE");
        expect(data.verdict?.summary).toContain("not recalculated");

        const pickRow = findSection(data, "picks").rows?.[0];
        expect(pickRow?.cells.pick).toBe("P1");
        expect(pickRow?.cells.capacityT).toBe(99.9);
        expect(pickRow?.cells.utilisationPct).toBe(2);
        expect(pickRow?.status).toBe("PASS");
    });

    test("does not fabricate slew, T8, T9, height parameters or site geometry", () => {
        const data = buildTowerPickReport(capturedSession(), METADATA);
        const crane = findSection(data, "crane-configuration");
        const slew = findMetric(crane, "Slew angle");

        expect(slew.value).toBeNull();
        expect(slew.value).not.toBe(0);
        expect(slew.unit).toBeUndefined();
        expect(slew.notes).toContain("Not evaluated");
        expect(slew.notes).toContain("No default or numeric value is inferred");

        expect(data.sections.some((section) => section.id === "oversail-checks")).toBe(false);
        expect(data.sections.some((section) => section.id === "site-summary")).toBe(false);
        expect(data.sections.some((section) => section.id === "site-boundary")).toBe(false);

        const height = findSection(data, "height-tie-in");
        expect(height.metrics ?? []).toEqual([]);
        expect(height.description).toContain("No T9 height report was supplied");
        expect(height.description).toContain("no planned height parameters were recorded");
    });

    test("discloses the absent site, T8 and T9 checks instead of reporting them as checked", () => {
        const data = buildTowerPickReport(capturedSession(), METADATA);
        const items = notCheckedItems(data);

        expect(items).toContain("Site model");
        expect(items).toContain("Oversail checks (T8)");
        expect(items).toContain("Height and tie-in checks (T9)");
        expect(items).toContain("Pad reactions");
        expect(items).toContain("General 3D minimum distance");

        const rows = findSection(data, "checks-not-performed").rows ?? [];
        const reasons = new Map(rows.map((row) => [String(row.cells.item), String(row.cells.reason)]));
        expect(reasons.get("Site model")).toContain("cannot verify site constraints");
        expect(reasons.get("Oversail checks (T8)")).toBe("No T8 oversail report was supplied.");
        expect(reasons.get("Height and tie-in checks (T9)")).toBe("No T9 height report was supplied.");
    });

    test("satisfies S7 validation and prints the required disclaimer and metadata", () => {
        const data = buildTowerPickReport(capturedSession(), METADATA);

        expect(() => validateReportData(data)).not.toThrow();
        expect(() => validateReportData({ ...data, metadata: { ...data.metadata, author: "  " } })).toThrow(
            "ReportData.metadata.author is required",
        );

        const html = generateReportHtml(data);
        expect(html).toContain(REQUIRED_DISCLAIMER);
        expect(html).toContain("<h2>Project: Harbour Project</h2>");
        expect(html).toContain("North Quay");
        expect(html).toContain("Test Engineer");
        expect(html).toContain("2026-11-16");
        expect(html).toContain("not recalculated");
        expect(html).not.toContain("Slew angle</td><td>0");
    });

    test("builds a schematic plan view from the captured coordinates", () => {
        const data = buildTowerPickReport(capturedSession(), METADATA);

        expect(data.planView?.imageDataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
        expect(data.planView?.scaleText).toBe("Schematic — not to scale");
        expect(data.verdict?.status).toBe("INCOMPLETE");

        const svg = decodeDataUrl(data.planView?.imageDataUrl);
        expect(svg).toContain("Mast (0, 0)");
        expect(svg).toContain("P1 pick-up (20, 0)");
        expect(svg).toContain("P1 set-down (0, 20)");
        expect(svg).toContain('class="plan-ring"');
        expect(svg).toContain("Schematic — not to scale");

        const html = generateReportHtml(data);
        expect(html).toContain('class="plan-view-image"');
        expect(html).toContain("Tower pick plan view");
        expect(html).toContain("Schematic — not to scale");
    });

    test("omits the plan view when a captured session has no pick coordinates", () => {
        const session = capturedSession();
        const withoutCoordinates: PickCheckSession = {
            ...session,
            picks: session.picks.map((pick) => ({ label: pick.label, loadT: pick.loadT })),
        };
        const data = buildTowerPickReport(withoutCoordinates, METADATA);

        expect(data.planView).toBeUndefined();
        expect(data.verdict?.status).toBe("INCOMPLETE");
    });

    test("omits malformed coordinates instead of plotting a partial plan view", () => {
        const session = capturedSession();
        const malformed: PickCheckSession = {
            ...session,
            picks: session.picks.map((pick) => ({ ...pick, supply: { x: Number.NaN, y: 0 } })),
        };
        const data = buildTowerPickReport(malformed, METADATA);

        expect(data.planView).toBeUndefined();
        expect(data.verdict?.status).toBe("INCOMPLETE");
    });
});
