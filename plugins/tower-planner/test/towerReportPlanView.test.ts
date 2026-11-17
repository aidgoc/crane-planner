// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import { MCT88 } from "../src/catalogue";
import { buildTowerReportPlanView, renderTowerPlanViewSvg } from "../src/report/towerReportPlanView";
import type { TowerReportPick, TowerReportSnapshot } from "../src/report/towerReportTypes";

/*
 * HAND-WORKED PROJECTION CASE (fixture values, not catalogue data):
 *
 * Mast (0, 0), P1 pick-up (20, 0), P1 set-down (0, 20), governing radius 20 m.
 * The governing ring therefore spans x = -20..20 and y = -20..20, a 40 m square.
 * The fixed viewport is 720 x 480 px with a 56 px padding, so the usable box is
 * 608 x 368 px. The shared scale is min(608 / 40, 368 / 40) = 9.2 px/m.
 * Mast   -> (720/2, 480/2)          = (360, 240)
 * Supply -> (360 + 20*9.2, 240)     = (544, 240)
 * Drop   -> (360, 240 - 20*9.2)     = (360, 56)
 * Ring   -> r = 20 * 9.2            = 184 px
 * +X is to the right and +Y is up (screen Y inverted), so the drop at +20 m Y
 * is drawn above the mast.
 */

const METADATA = {
    projectName: "T10 Plan View Test",
    siteLocation: "Test Site",
    date: "2026-11-17",
    author: "Test Engineer",
};

function reportPick(overrides: Partial<TowerReportPick> = {}): TowerReportPick {
    return {
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
        supply: { x: 20, y: 0 },
        drop: { x: 0, y: 20 },
        ...overrides,
    };
}

function snapshot(overrides: Partial<TowerReportSnapshot> = {}): TowerReportSnapshot {
    return {
        metadata: METADATA,
        site: null,
        siteSource: null,
        crane: MCT88,
        placement: { x: 0, y: 0 },
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
        oversail: null,
        height: null,
        verdict: "INCOMPLETE",
        failedChecks: [],
        notChecked: [],
        sources: [],
        assumptions: [],
        notes: [],
        ...overrides,
    };
}

function decodeSvg(dataUrl: string): string {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("plan-view data URL has no payload");
    return decodeURIComponent(dataUrl.slice(comma + 1));
}

function planSvg(overrides: Partial<TowerReportSnapshot> = {}): string {
    const view = buildTowerReportPlanView(snapshot(overrides));
    if (view === undefined || view.imageDataUrl === undefined) {
        throw new Error("plan view was not generated");
    }
    return decodeSvg(view.imageDataUrl);
}

function numberAttribute(svg: string, className: string, name: string): number {
    const match = new RegExp(`class="${className}"[^>]*\\s${name}="([^"]+)"`).exec(svg);
    const value = match?.[1];
    if (value === undefined) throw new Error(`missing ${className}.${name}`);
    return Number(value);
}

describe("T10 plan-view SVG renderer", () => {
    test("projects site coordinates with a shared scale and an inverted screen Y", () => {
        const svg = planSvg();

        expect(svg).toContain('<circle class="plan-ring" cx="360" cy="240" r="184"');
        expect(svg).toContain('<circle class="plan-supply-marker" cx="544" cy="240"');
        expect(svg).toContain('<rect class="plan-drop-marker" x="355" y="51"');
        expect(svg).toContain("Mast (0, 0)");
        expect(svg).toContain("P1 pick-up (20, 0)");
        expect(svg).toContain("P1 set-down (0, 20)");

        // +X is drawn to the right of the mast and +Y above it.
        const mastX = numberAttribute(svg, "plan-mast-marker", "x") + 7;
        const mastY = numberAttribute(svg, "plan-mast-marker", "y") + 7;
        expect(numberAttribute(svg, "plan-supply-marker", "cx")).toBeGreaterThan(mastX);
        expect(numberAttribute(svg, "plan-drop-marker", "y") + 5).toBeLessThan(mastY);
    });

    test("emits an S7-compatible SVG data URL with the schematic scale text", () => {
        const view = buildTowerReportPlanView(snapshot());

        expect(view).toBeDefined();
        expect(view?.imageDataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
        expect(view?.scaleText).toBe("Schematic — not to scale");
        expect(view?.title).toBe("Tower pick plan view");
        expect(view?.caption).toContain("Schematic only");
    });

    test("is deterministic for the same snapshot", () => {
        const first = buildTowerReportPlanView(snapshot());
        const second = buildTowerReportPlanView(snapshot());

        expect(first?.imageDataUrl).toBe(second?.imageDataUrl);
        expect(renderTowerPlanViewSvg(snapshot())).toBe(renderTowerPlanViewSvg(snapshot()));
    });

    test("escapes pick labels and emits no script or external resource markup", () => {
        const label = `P1 <script>alert("x")</script> & 'y'`;
        const svg = planSvg({ picks: [reportPick({ label })] });

        expect(svg).toContain("P1 &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &apos;y&apos;");
        expect(svg).not.toContain("<script");
        expect(svg).not.toContain("href=");
        expect(svg).not.toContain("<image");
        expect(svg).not.toContain("javascript:");
    });

    test("uses the existing label verbatim and falls back only for a blank label", () => {
        const svg = planSvg({
            picks: [reportPick({ label: "P1" }), reportPick({ label: "  ", supply: { x: -20, y: 0 } })],
        });

        expect(svg).toContain("P1 pick-up");
        expect(svg).toContain("Pick 2 pick-up (-20, 0)");
    });

    const invalidPickCases: [string, Partial<TowerReportPick>][] = [
        ["a missing pick-up point", { supply: undefined }],
        ["a missing set-down point", { drop: undefined }],
        ["a non-finite pick-up X", { supply: { x: Number.NaN, y: 0 } }],
        ["a non-finite set-down Y", { drop: { x: 0, y: Number.POSITIVE_INFINITY } }],
        ["a missing governing radius", { radiusM: null }],
        ["a non-finite governing radius", { radiusM: Number.NaN }],
        ["a zero governing radius", { radiusM: 0 }],
        ["a negative governing radius", { radiusM: -1 }],
    ];

    test.each(invalidPickCases)("omits the plan view for %s", (_label, pickOverrides) => {
        expect(buildTowerReportPlanView(snapshot({ picks: [reportPick(pickOverrides)] }))).toBeUndefined();
    });

    test("omits the plan view when the mast position is not finite", () => {
        expect(buildTowerReportPlanView(snapshot({ placement: { x: Number.NaN, y: 0 } }))).toBeUndefined();
        expect(
            buildTowerReportPlanView(snapshot({ placement: { x: 0, y: Number.NEGATIVE_INFINITY } })),
        ).toBeUndefined();
    });

    test("omits the plan view when there are no picks to draw", () => {
        expect(buildTowerReportPlanView(snapshot({ picks: [] }))).toBeUndefined();
    });

    test("does not imply a swing path, jib orientation or site boundary", () => {
        const svg = planSvg();

        expect(svg).toContain("Dashed rings show governing hook radii");
        expect(svg).toContain("No swing path, jib orientation, clearance or site boundary is shown.");
        expect(svg).toContain("not to scale");
    });
});
