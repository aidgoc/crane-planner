// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 / S4 — Active Project Site Model Obstacles Integration Tests
// Owner: Ajit
// ============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { PubSub, type PubSubEventMap } from "@chili3d/core";
import { createMockApplication, createMockView, TestDocument } from "@chili3d/core/test-utils";
import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { writeSiteSource } from "../../site-model/src/siteSelection";
import type { SiteProject } from "../../site-model/src/types";
import { PlaceMobileCraneCommand } from "../src/commands/placeCrane";
import { computePlacement, createDefaultPlacementInput } from "../src/modules/placementState";
import { adaptSiteProjectToObstacles, loadPlacementObstacles } from "../src/modules/siteObstacleAdapter";
import { MobileCranePlacementPanel } from "../src/ui/mobilePlacementPanel";

const sampleDxf = readFileSync(
    path.resolve(import.meta.dirname, "../../../public/sample-site/sample-site.dxf"),
    "utf-8",
);

/**
 * Shifts DXF coordinates by `offset` metres.
 * Used for project switching tests: Site B is the sample site shifted +100 m in X and Y.
 *
 * HAND CHECK:
 * - With Site A: Tower A is at x in [25, 65], y in [20, 42].
 *   A crane standing at (15, 31) slewing 0° (east) with 19 m operating radius reaches x = 34 m, y = 31 m.
 *   This point is INSIDE Tower A -> COLLISION -> clearance FAIL.
 * - With Site B (shifted +100 m): Tower A moves to x in [125, 165], y in [120, 142].
 *   The crane at (15, 31) reaching to (34, 31) is over 90 m away from shifted Tower A -> clearance PASS.
 * This proves that the mobile crane clearance engine computes against the active project's site,
 * and never against hard-coded or cached site data.
 */
function shiftDxfCoordinates(dxfText: string, offset: number): string {
    const lines = dxfText.split(/\r?\n/);
    const coordCodes = new Set(["10", "20", "11", "21"]);
    for (let i = 0; i < lines.length - 1; i++) {
        if (coordCodes.has(lines[i].trim())) {
            const val = Number.parseFloat(lines[i + 1].trim());
            if (!Number.isNaN(val)) {
                lines[i + 1] = (val + offset).toFixed(4);
            }
        }
    }
    return lines.join("\n");
}

const shiftedDxf = shiftDxfCoordinates(sampleDxf, 100);

function captureToasts(): unknown[][] {
    const calls: unknown[][] = [];
    const handler = (...args: unknown[]) => {
        calls.push(args);
    };
    PubSub.default.sub("showToast", handler as PubSubEventMap["showToast"]);
    return calls;
}

function createDom(): HTMLElement {
    const dom = document.createElement("div");
    dom.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect;
    dom.setPointerCapture = rs.fn();
    dom.hasPointerCapture = rs.fn(() => false);
    dom.releasePointerCapture = rs.fn();
    return dom;
}

function createSiteView(dxfText?: string, siteName = "site.dxf") {
    const document = new TestDocument();
    if (dxfText !== undefined) {
        const written = writeSiteSource(document, { kind: "dxfText", name: siteName, dxfText });
        if (!written.isOk) throw new Error(written.error);
    }
    const view = createMockView({ dom: createDom(), document } as never);
    return { view, document };
}

function makeInput(overrides: Partial<MobilePlacementInput> = {}): MobilePlacementInput {
    return { ...createDefaultPlacementInput(), ...overrides };
}

afterEach(() => {
    PubSub.default.removeAll("showToast");
});

describe("M8 / S4 — Active Project Site Obstacle Adapter", () => {
    test("adaptSiteProjectToObstacles extracts polygonal buildings, power lines, and no-go zones", () => {
        const project: SiteProject = {
            schema_version: "1.0",
            name: "Test Site",
            disclaimer: "Planning aid, not a certified lift plan.",
            units: "m",
            origin: "SW corner",
            boundary: {
                layer: "BOUNDARY",
                width_m: 50,
                depth_m: 50,
                elements: [],
                polygon: [
                    { x: 0, y: 0 },
                    { x: 50, y: 0 },
                    { x: 50, y: 50 },
                    { x: 0, y: 50 },
                ],
                area_m2: 2500,
            },
            buildings: {
                building_1: {
                    id: "building_1",
                    layer: "BLD",
                    label: "Main Hall (15 m)",
                    polygon: [
                        { x: 10, y: 10 },
                        { x: 30, y: 10 },
                        { x: 30, y: 25 },
                        { x: 10, y: 25 },
                    ],
                    height_m: 15,
                    source: "INDICATIVE",
                },
                degenerate: {
                    id: "degenerate",
                    layer: "BLD",
                    label: "Degenerate Line",
                    polygon: [
                        { x: 0, y: 0 },
                        { x: 5, y: 5 },
                    ],
                    height_m: 10,
                    source: "INDICATIVE",
                },
            },
            supply_zones: {},
            no_go_zones: [
                {
                    id: "well",
                    label: "Heritage Well (5 m radius)",
                    center: { x: 40, y: 40 },
                    radius_m: 5,
                    source: "INDICATIVE",
                },
            ],
            power_line: {
                layer: "POWER",
                x_m: -12,
                voltage_kv: 33,
                clearance_m: 7.0,
                clearance_note: "UK HSE GS6",
            },
            no_oversail: [],
            oversail_by_permission: [],
            picks: [],
        };

        const obstacles = adaptSiteProjectToObstacles(project);
        expect(obstacles).toHaveLength(3); // degenerate building skipped

        // Building check
        const bld = obstacles.find((o) => o.label === "Main Hall (15 m)");
        expect(bld).toBeDefined();
        expect(bld?.polygon).toEqual([
            [10, 10],
            [30, 10],
            [30, 25],
            [10, 25],
        ]);
        expect(bld?.heightM).toBe(15);
        expect(bld?.requiredClearanceM).toBe(2.0);

        // Power line check
        const pwr = obstacles.find((o) => o.xLineM === -12);
        expect(pwr).toBeDefined();
        expect(pwr?.label).toBe("33 kV Power Line (x = -12 m)");
        expect(pwr?.requiredClearanceM).toBe(7.0);

        // No-go zone check
        const nogo = obstacles.find((o) => o.xM === 40 && o.yM === 40);
        expect(nogo).toBeDefined();
        expect(nogo?.label).toBe("Heritage Well (5 m radius)");
        expect(nogo?.requiredClearanceM).toBe(5.0);
    });

    test("loadPlacementObstacles reports noActiveSite toast when document has no site source", () => {
        const toasts = captureToasts();
        const doc = new TestDocument();
        doc.name = "EmptyProject";

        const res = loadPlacementObstacles(doc);
        expect(res).toBeUndefined();
        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.[0]).toBe("mobile.crane.site.noActiveSite");
        expect(toasts[0]?.[1]).toBe("EmptyProject");
    });

    test("loadPlacementObstacles reports unavailable toast on corrupt DXF", () => {
        const toasts = captureToasts();
        const doc = new TestDocument();
        writeSiteSource(doc, { kind: "dxfText", name: "bad.dxf", dxfText: "corrupted non-dxf data" });

        const res = loadPlacementObstacles(doc);
        expect(res).toBeUndefined();
        expect(toasts).toHaveLength(1);
        expect(toasts[0]?.[0]).toBe("mobile.crane.site.unavailable");
    });

    test("loadPlacementObstacles loads all obstacles from sample-site.dxf", () => {
        const doc = new TestDocument();
        writeSiteSource(doc, { kind: "dxfText", name: "sample-site.dxf", dxfText: sampleDxf });

        const res = loadPlacementObstacles(doc);
        expect(res).toBeDefined();
        expect(res?.siteName).toBe("sample-site.dxf");
        expect(res?.obstacles.length).toBeGreaterThanOrEqual(7);

        const labels = res?.obstacles.map((o) => o.label.toUpperCase()) ?? [];
        expect(labels.some((l) => l.includes("TOWER A"))).toBe(true);
        expect(labels.some((l) => l.includes("TOWER B"))).toBe(true);
        expect(labels.some((l) => l.includes("PODIUM"))).toBe(true);
        expect(labels.some((l) => l.includes("SITE OFFICE"))).toBe(true);
        expect(labels.some((l) => l.includes("POWER LINE"))).toBe(true);
    });
});

describe("M8 / S4 — Project Switching and Clearance Hand Check", () => {
    test("Site A vs Site B (+100 m shift): Crane at (15, 31) fails clearance on Site A, passes on Site B", () => {
        // Document A with standard sample site
        const docA = new TestDocument();
        writeSiteSource(docA, { kind: "dxfText", name: "site-a.dxf", dxfText: sampleDxf });
        const siteA = loadPlacementObstacles(docA);
        expect(siteA).toBeDefined();

        // Document B with sample site shifted +100 m
        const docB = new TestDocument();
        writeSiteSource(docB, { kind: "dxfText", name: "site-b.dxf", dxfText: shiftedDxf });
        const siteB = loadPlacementObstacles(docB);
        expect(siteB).toBeDefined();

        // Crane position: (5, 31), slew 0° (East), boomLength 38 m, boomAngle 60°
        // Operating radius = 19.8 m.
        // Boom tip is at x = 5 + 19.8 = 24.8 m, y = 31 m.
        const input = makeInput({
            craneCentreXM: 5,
            craneCentreYM: 31,
            slewAngleDeg: 0,
            boomLengthM: 38,
            boomAngleDeg: 60,
            allowableBearingT_M2: 100, // generous bearing so clearance determines verdict
        });

        // 1. Evaluate on Site A
        const resA = computePlacement(input, siteA?.obstacles ?? []);
        const towerA_SiteA = resA.obstacleClearances.find((c) => c.label.toUpperCase().includes("TOWER A"));
        expect(towerA_SiteA).toBeDefined();
        // Boom tip at (24.8, 31) is 0.2 m from Tower A west wall at x = 25 m -> margin -1.8 m -> FAIL
        expect(towerA_SiteA?.distanceM).toBeCloseTo(0.2, 1);
        expect(towerA_SiteA?.marginM).toBeCloseTo(-1.8, 1);
        expect(towerA_SiteA?.status).toBe("FAIL");
        expect(resA.clearanceStatus).toBe("FAIL");
        expect(resA.overallVerdict).toBe("FAIL");

        // 2. Evaluate on Site B (Tower A is now at x in [125, 165], y in [120, 142])
        const resB = computePlacement(input, siteB?.obstacles ?? []);
        const towerA_SiteB = resB.obstacleClearances.find((c) => c.label.toUpperCase().includes("TOWER A"));
        expect(towerA_SiteB).toBeDefined();
        // Boom tip at (24.8, 31) is over 100 m away from shifted Tower A -> safe PASS
        expect(towerA_SiteB?.status).toBe("PASS");
        expect(towerA_SiteB?.marginM).toBeGreaterThan(100);
    });

    test("PlaceMobileCraneCommand executes and wires active project obstacles into panel", async () => {
        const { view } = createSiteView(sampleDxf, "sample-site.dxf");
        const app = createMockApplication();
        app.activeView = view;

        const cmd = new PlaceMobileCraneCommand();
        await cmd.execute(app);

        // Instantiating panel directly with view reads view.document obstacles
        const panel = new MobileCranePlacementPanel(view);
        expect(panel.getSiteName()).toBe("sample-site.dxf");
        expect(panel.getObstacles().length).toBeGreaterThanOrEqual(7);

        panel.dispose();
    });

    test("MobileCranePlacementPanel without site source initializes with empty obstacles and shows helpful note", () => {
        const toasts = captureToasts();
        const doc = new TestDocument();
        doc.name = "EmptySiteDoc";
        const view = createMockView({ dom: createDom(), document: doc } as never);

        const panel = new MobileCranePlacementPanel(view);
        expect(panel.getSiteName()).toBeUndefined();
        expect(panel.getObstacles()).toHaveLength(0);

        // Toasts user that no site model is selected
        expect(toasts.some((t) => t[0] === "mobile.crane.site.noActiveSite")).toBe(true);

        panel.dispose();
    });
});
