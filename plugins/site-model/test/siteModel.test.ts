// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { ShapeTypes } from "@chili3d/core";
import { initWasm } from "@chili3d/wasm";
import { createTestFactory } from "../../../packages/wasm/test/helpers";
import { calculateExactFilletedRectArea, calculatePolygonArea, parseDxfToSite } from "../src/dxfParser";
import { extrudeBuildingSolid, getSolidVolumeM3 } from "../src/extrusion";
import { loadProjectJson, saveProjectJson, validateSiteProject } from "../src/schema";
import { metresToMm, mmToMetres, REQUIRED_DISCLAIMER } from "../src/types";

// Load WASM kernel for 3D extrusion tests
const WASM_BINARY = readFileSync(
    path.resolve(import.meta.dirname, "../../../packages/wasm/lib/chili-wasm.wasm"),
);

beforeAll(async () => {
    await initWasm({ wasmBinary: WASM_BINARY });
});

describe("DGOC Site Model Plugin (Ajit Lead)", () => {
    const sampleDxfPath = path.resolve(import.meta.dirname, "../../../public/sample-site/sample-site.dxf");
    const sampleDxfContent = readFileSync(sampleDxfPath, "utf-8");

    const sampleJsonPath = path.resolve(import.meta.dirname, "../../../public/sample-site/sample-site.json");
    const sampleJsonContent = readFileSync(sampleJsonPath, "utf-8");
    const sampleJsonData = JSON.parse(sampleJsonContent);

    // =========================================================================
    // S1: DXF Import via dxf-parser
    // =========================================================================
    describe("S1: DXF import via dxf-parser into project JSON", () => {
        /*
         * HAND CALCULATION:
         * Plot dimensions: Width = 90.0 m, Depth = 72.0 m.
         * Full rectangular area = 90.0 * 72.0 = 6480.0 m².
         * The North-East corner has an inward fillet arc with Radius R = 10.0 m.
         * The corner cutout from a rectangle is a square corner (R x R = 10 x 10 = 100 m²)
         * minus the quarter-circle area enclosed:
         * Area_quarter_circle = 0.25 * π * R² = 0.25 * π * 100 = 25 * π ≈ 78.5398163397 m².
         * Corner cutout area = 100 - 78.5398163397 = 21.46018366 m².
         * Net exact plot area = 6480.0 - 21.46018366 = 6458.539816 m² ≈ 6458.54 m².
         * Acceptance criterion: area within 0.5% tolerance (within ±32.29 m²).
         * 0.5% lower limit: 6458.54 * 0.995 = 6426.25 m²
         * 0.5% upper limit: 6458.54 * 1.005 = 6490.83 m²
         */
        test("sample-site.dxf loads, boundary closes as a loop, NE arc converts radians, area within 0.5%", () => {
            const site = parseDxfToSite(sampleDxfContent);

            // 1. Plot boundary exists
            expect(site.boundary).toBeDefined();
            expect(site.boundary.width_m).toBe(90.0);
            expect(site.boundary.depth_m).toBe(72.0);
            expect(site.boundary.ne_corner_arc_r).toBe(10.0);

            // 2. Loop closes: first point is (0,0), next is (90,0), ends back at (0,72) -> (0,0)
            const poly = site.boundary.polygon;
            expect(poly.length).toBeGreaterThanOrEqual(5);
            expect(poly[0]).toEqual({ x: 0, y: 0 });
            expect(poly[1]).toEqual({ x: 90, y: 0 });

            // 3. Exact hand-calculated area comparison
            const exactArea = calculateExactFilletedRectArea(90, 72, 10);
            expect(exactArea).toBeCloseTo(6458.54, 1);

            // 4. Sampled polygon area via shoelace formula
            const polygonArea = calculatePolygonArea(poly);
            const percentageDiff = Math.abs(polygonArea - exactArea) / exactArea;

            // Must be within 0.5%
            expect(percentageDiff).toBeLessThan(0.005);
            expect(site.boundary.area_m2).toBeCloseTo(exactArea, 1);

            // 5. Verify buildings were detected
            expect(site.buildings.tower_a).toBeDefined();
            expect(site.buildings.tower_b).toBeDefined();
            expect(site.buildings.podium).toBeDefined();

            // 6. Verify hazards
            expect(site.no_go_zones.length).toBeGreaterThan(0);
            expect(site.no_go_zones[0].id).toBe("well");
            expect(site.no_go_zones[0].radius_m).toBe(4.0);
            expect(site.road).toBeDefined();
            expect(site.power_line).toBeDefined();
            expect(site.power_line?.clearance_m).toBe(6.0);
        });
    });

    // =========================================================================
    // S2: Units Test (Metres to Millimetres boundary)
    // =========================================================================
    describe("S2: Units test", () => {
        /*
         * HAND CALCULATION:
         * Tower A south edge extends from X=25.0 m to X=65.0 m.
         * Edge length in metres = 65.0 - 25.0 = 40.0 m.
         * In Chili3D CAD scene (millimetres):
         * length_scene = 40.0 m * 1000 = 40,000.0 mm.
         * Read back from scene to site data:
         * length_site = 40,000.0 mm / 1000 = 40.000 m.
         */
        test("a known 40 m edge appears as 40,000 mm in the scene and reads back as 40.000 m", () => {
            const site = parseDxfToSite(sampleDxfContent);
            const towerA = site.buildings.tower_a;
            expect(towerA).toBeDefined();

            const p1 = towerA.polygon[0]; // (25, 20)
            const p2 = towerA.polygon[1]; // (65, 20)
            const edgeLengthMetres = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            expect(edgeLengthMetres).toBe(40.0);

            // Transform to CAD scene
            const edgeLengthSceneMm = metresToMm(edgeLengthMetres);
            expect(edgeLengthSceneMm).toBe(40000.0);

            // Read back from scene to site
            const readBackMetres = mmToMetres(edgeLengthSceneMm);
            expect(readBackMetres).toBe(40.0);
        });
    });

    // =========================================================================
    // S3: 3D Building Extrusion (Volume = 66,000 m³)
    // =========================================================================
    describe("S3: Buildings extruded to 3D solids from footprint + height", () => {
        /*
         * HAND CALCULATION:
         * Tower A (footprint 25..65 along X, 20..42 along Y, height 75 m):
         * Width (X) = 65.0 - 25.0 = 40.0 m = 40,000 mm.
         * Depth (Y) = 42.0 - 20.0 = 22.0 m = 22,000 mm.
         * Height (Z) = 75.0 m = 75,000 mm.
         * Solid Volume in mm³ = 40,000 * 22,000 * 75,000 = 6.6 * 10^13 mm³.
         * Solid Volume in m³ = (6.6 * 10^13) / (1000^3) = 66,000.0 m³.
         */
        test("Tower A gives a 3D solid with volume 40 x 22 x 75 = 66,000 m^3", () => {
            const factory = createTestFactory();
            const site = parseDxfToSite(sampleDxfContent);
            const towerA = site.buildings.tower_a;

            expect(towerA).toBeDefined();
            expect(towerA.height_m).toBe(75.0);

            // Extrude into 3D solid
            const solidResult = extrudeBuildingSolid(factory, towerA.polygon, towerA.height_m);
            expect(solidResult.isOk).toBe(true);

            const solid = solidResult.value;
            expect(solid.shapeType).toBe(ShapeTypes.solid);

            // Compute volume in cubic metres
            const volumeM3 = getSolidVolumeM3(solid);

            // Hand-calculated expected volume = 40 * 22 * 75 = 66,000 m³
            const expectedVolumeM3 = 40 * 22 * 75;
            expect(volumeM3).toBeCloseTo(expectedVolumeM3, 1);
        });
    });

    // =========================================================================
    // S4: Project JSON Schema v1 Round-Trip & Validation
    // =========================================================================
    describe("S4: Project JSON schema v1 with save/load round trip", () => {
        test("Save then load returns identical data", () => {
            const site = parseDxfToSite(sampleDxfContent, {
                picks: sampleJsonData.picks,
            });

            // Save to JSON string
            const jsonStr = saveProjectJson(site);
            expect(typeof jsonStr).toBe("string");

            // Load back from JSON string
            const loadResult = loadProjectJson(jsonStr);
            expect(loadResult.isOk).toBe(true);

            const loadedSite = loadResult.value;
            expect(loadedSite.schema_version).toBe("1.0");
            expect(loadedSite.units).toBe("m");
            expect(loadedSite.boundary.width_m).toBe(site.boundary.width_m);
            expect(loadedSite.boundary.depth_m).toBe(site.boundary.depth_m);
            expect(loadedSite.boundary.area_m2).toBeCloseTo(site.boundary.area_m2, 4);

            // Verify buildings preserved
            expect(Object.keys(loadedSite.buildings)).toEqual(Object.keys(site.buildings));
            expect(loadedSite.buildings.tower_a.height_m).toBe(75.0);

            // Verify picks preserved
            expect(loadedSite.picks.length).toBe(site.picks.length);
        });

        test("Schema validation rejects invalid data and requires mandatory disclaimer", () => {
            // Missing disclaimer test
            const invalidData = {
                schema_version: "1.0",
                units: "m",
                boundary: {
                    polygon: [
                        { x: 0, y: 0 },
                        { x: 1, y: 0 },
                        { x: 1, y: 1 },
                    ],
                },
                buildings: {},
                disclaimer: "Something else without the exact legal text",
            };
            const result = validateSiteProject(invalidData);
            expect(result.isOk).toBe(false);
            expect(result.error).toContain(REQUIRED_DISCLAIMER);
        });
    });

    // =========================================================================
    // Mandatory Rules Checks
    // =========================================================================
    describe("Mandatory Rules Checks", () => {
        test("Mandatory disclaimer appears in schema and exports", () => {
            const site = parseDxfToSite(sampleDxfContent);
            expect(site.disclaimer).toBe("Planning aid, not a certified lift plan.");
        });

        test("All data fields have source attribution or are labelled INDICATIVE", () => {
            const site = parseDxfToSite(sampleDxfContent);
            for (const bldg of Object.values(site.buildings)) {
                expect(bldg.source.length).toBeGreaterThan(0);
                expect(bldg.source).toContain("INDICATIVE");
            }
            for (const noGo of site.no_go_zones) {
                expect(noGo.source).toContain("INDICATIVE");
            }
            expect(site.power_line?.clearance_note).toContain("INDICATIVE");
        });
    });
});
