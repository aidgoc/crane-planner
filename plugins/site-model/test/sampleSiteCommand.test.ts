// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Tests for "Load sample site" command, 3D Building bodies, and Hazard clearance
// Owner: Ajit
// ============================================================================

import type { IApplication, INode } from "@chili3d/core";
import { createMockDocument } from "@chili3d/core/test-utils";
import { BuildingBodyNode } from "../src/body/buildingBody";
import { LoadSampleSiteCommand } from "../src/commands/loadSampleSite";
import { checkPowerLineClearance } from "../src/hazardClearance";
import { SAMPLE_SITE_PROJECT } from "../src/sampleSiteData";
import { getActiveSiteProject, resetActiveSiteProject } from "../src/siteStore";
import type { PowerLineZone } from "../src/types";

describe("Load sample site command & 3D Building Bodies", () => {
    beforeEach(() => {
        resetActiveSiteProject();
    });

    test("bundled SAMPLE_SITE_PROJECT contains all required structures with valid heights", () => {
        expect(SAMPLE_SITE_PROJECT.buildings.tower_a).toBeDefined();
        expect(SAMPLE_SITE_PROJECT.buildings.tower_a.height_m).toBe(75.0);
        expect(SAMPLE_SITE_PROJECT.buildings.tower_b.height_m).toBe(45.0);
        expect(SAMPLE_SITE_PROJECT.buildings.podium.height_m).toBe(9.0);
        expect(SAMPLE_SITE_PROJECT.buildings.site_office.height_m).toBe(3.0);
        expect(SAMPLE_SITE_PROJECT.buildings.nb_east.height_m).toBe(30.0);
        expect(SAMPLE_SITE_PROJECT.buildings.nb_north.height_m).toBe(12.0);
    });

    test("getActiveSiteProject returns default sample site when not yet set", () => {
        const active = getActiveSiteProject();
        expect(active.name).toContain("DGOC sample site");
        expect(active.buildings.tower_a.height_m).toBe(75.0);
    });

    test("BuildingBodyNode initialises parameters and validates height and polygon", () => {
        const mockDoc = createMockDocument();
        const node = new BuildingBodyNode({
            document: mockDoc,
            name: "tower_a",
            label: "Tower A (75m)",
            polygon: [
                { x: 25, y: 20 },
                { x: 65, y: 20 },
                { x: 65, y: 42 },
                { x: 25, y: 42 },
            ],
            heightM: 75.0,
        });

        expect(node.label).toBe("Tower A (75m)");
        expect(node.heightM).toBe(75.0);
        expect(node.polygon).toHaveLength(4);

        // Invalid height should throw
        expect(() => {
            node.heightM = -5;
        }).toThrow();

        // Invalid polygon should throw
        expect(() => {
            node.polygon = [{ x: 0, y: 0 }];
        }).toThrow();
    });

    test("LoadSampleSiteCommand creates building nodes and adds them to document", async () => {
        const mockDoc = createMockDocument();
        const addedNodes: INode[] = [];
        const originalAddNode = mockDoc.modelManager.addNode.bind(mockDoc.modelManager);
        mockDoc.modelManager.addNode = (...nodes: INode[]) => {
            addedNodes.push(...nodes);
            return originalAddNode(...nodes);
        };

        const mockApp = {
            activeView: {
                document: mockDoc,
            },
        } as unknown as IApplication;

        const cmd = new LoadSampleSiteCommand();
        await cmd.execute(mockApp);

        // Buildings with height > 0: tower_a, podium, tower_b, site_office, nb_east, nb_north (6 buildings)
        expect(addedNodes.length).toBe(6);
        const labels = addedNodes.map((n) => (n as BuildingBodyNode).label);
        expect(labels.some((l) => l.includes("TOWER A"))).toBe(true);
        expect(labels.some((l) => l.includes("TOWER B"))).toBe(true);
        expect(labels.some((l) => l.includes("PODIUM"))).toBe(true);

        // Verify active site store was updated
        const current = getActiveSiteProject();
        expect(current).toBeDefined();
        expect(current.buildings.tower_a.height_m).toBe(75.0);
    });
});

describe("Power line clearance & downstream application (Review Point 2)", () => {
    // Hand-worked test fixture calculation:
    // PowerLineZone: x = -9.0 m, clearance_m = 6.0 m (INDICATIVE synthetic test fixture from public/sample-site/README.md)
    // Point A at x = 0.0 m:
    //   distance to power line = |0 - (-9)| = 9.0 m
    //   margin = 9.0 - 6.0 = +3.0 m -> SAFE (isViolated = false)
    // Point B at x = -5.0 m:
    //   distance = |-5 - (-9)| = 4.0 m
    //   margin = 4.0 - 6.0 = -2.0 m -> VIOLATED (isViolated = true)
    // Point C with crane boom radius = 4.0 m at x = 0.0 m:
    //   distance to boom tip = 9.0 - 4.0 = 5.0 m
    //   margin = 5.0 - 6.0 = -1.0 m -> VIOLATED (isViolated = true)

    const fixturePowerLine: PowerLineZone = {
        layer: "POWER_LINE",
        x_m: -9.0,
        voltage_kv: 22,
        clearance_m: 6.0,
        clearance_note: "INDICATIVE sample value; the real figure comes from the local electricity authority",
    };

    test("point at x = 0.0 m maintains safe clearance to power line at x = -9.0 m", () => {
        const res = checkPowerLineClearance(fixturePowerLine, 0.0);
        expect(res.distanceM).toBe(9.0);
        expect(res.requiredClearanceM).toBe(6.0);
        expect(res.marginM).toBe(3.0);
        expect(res.isViolated).toBe(false);
    });

    test("point at x = -5.0 m violates 6.0 m clearance buffer", () => {
        const res = checkPowerLineClearance(fixturePowerLine, -5.0);
        expect(res.distanceM).toBe(4.0);
        expect(res.marginM).toBe(-2.0);
        expect(res.isViolated).toBe(true);
    });

    test("boom reach extending into power line corridor triggers safety violation", () => {
        const res = checkPowerLineClearance(fixturePowerLine, 0.0, 4.0);
        expect(res.distanceM).toBe(5.0);
        expect(res.marginM).toBe(-1.0);
        expect(res.isViolated).toBe(true);
    });
});
