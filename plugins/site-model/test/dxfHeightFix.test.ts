// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M9 — dxfParser: building height unknown → null, not 10 m default
// Owner: Ajit
//
// RULE (AGENTS.md): Never invent crane specs, clearance distances, or heights.
// When a building has no height label and no manual override, its height MUST be
// null, not 10 m. M6 marks null-height buildings NOT_CHECKED.
// ============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@rstest/core";
import { parseDxfToSite } from "../src/dxfParser";

const sampleDxf = readFileSync(
    path.resolve(import.meta.dirname, "../../../public/sample-site/sample-site.dxf"),
    "utf-8",
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove the height substring from a building's DXF TEXT label.
 * e.g. "TOWER A  G+24  75.0 m" → "TOWER A  G+24"
 * This simulates a building that was drawn without a height annotation.
 *
 * Strategy: replace the first occurrence of "NNN m" (with optional decimal)
 * in the DXF text that belongs to the target building label.
 */
function stripHeightFromLabel(dxfText: string, originalLabel: string): string {
    // The label appears as a TEXT entity value (group code 1) in the DXF.
    // We replace the whole label line with the stripped version.
    const stripped = originalLabel.replace(/\s*\d+(?:\.\d+)?\s*m\b/i, "").trim();
    return dxfText.replace(originalLabel, stripped);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("M9 — dxfParser: unknown building height → null, not 10 m", () => {
    test("buildings WITH height labels in sample DXF have the correct numeric height_m", () => {
        // HAND CHECK from public/sample-site/sample-site.dxf DXF TEXT labels:
        //   TOWER A  G+24  75.0 m  → height_m = 75
        //   TOWER B  G+14  45.0 m  → height_m = 45
        //   PODIUM   G+2    9.0 m  → height_m = 9
        // Parser must read the actual label values, not invent numbers.
        const result = parseDxfToSite(sampleDxf);

        expect(result.buildings.tower_a.height_m).toBe(75);
        expect(result.buildings.tower_b.height_m).toBe(45);
        expect(result.buildings.podium.height_m).toBe(9);
    });

    test("building WITHOUT height label: height_m is null, never the 10 m default", () => {
        // HAND CHECK:
        // We strip the "75.0 m" substring from Tower A's DXF label text.
        // The parser sees "TOWER A  G+24" (no "NNN m" pattern).
        // Before this fix: height = undefined ?? undefined ?? 10.0 = 10  ← WRONG
        // After this fix:  height = undefined ?? undefined ?? null  = null ← CORRECT
        //
        // null means "unknown" — the M6 engine marks it NOT_CHECKED, not SAFE.
        const towerALabel = "TOWER A  G+24  75.0 m";
        const dxfNoHeight = stripHeightFromLabel(sampleDxf, towerALabel);

        const result = parseDxfToSite(dxfNoHeight);

        const towerA = result.buildings.tower_a;
        expect(towerA).toBeDefined();

        // Critical assertion: must NOT be 10 (the old invented default)
        expect(towerA.height_m).toBeNull();
        expect(towerA.height_m).not.toBe(10);
        expect(towerA.height_m).not.toBe(10.0);
    });

    test("buildingHeights option overrides a null height from a label-less building", () => {
        // HAND CHECK:
        // Strip Tower A's height label → height_m would be null.
        // Supply buildingHeights: { tower_a: 80 } → parser must use 80.
        // Expected: height_m = 80 (override wins), not null, not 10.
        const towerALabel = "TOWER A  G+24  75.0 m";
        const dxfNoHeight = stripHeightFromLabel(sampleDxf, towerALabel);

        const result = parseDxfToSite(dxfNoHeight, { buildingHeights: { tower_a: 80 } });

        const towerA = result.buildings.tower_a;
        expect(towerA).toBeDefined();
        expect(towerA.height_m).toBe(80);
    });

    test("buildingHeights option overrides even when the label has a height (override wins)", () => {
        // HAND CHECK:
        // Tower B label has "45.0 m" → rawHeight = 45.
        // buildingHeights: { tower_b: 50 } is supplied.
        // Priority: override ?? rawHeight ?? null → 50 wins.
        const result = parseDxfToSite(sampleDxf, { buildingHeights: { tower_b: 50 } });

        expect(result.buildings.tower_b.height_m).toBe(50);
        // Other buildings without override still use their label height
        expect(result.buildings.tower_a.height_m).toBe(75);
    });
});
