// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { expect, test } from "@rstest/core";
import sampleSite from "../../../public/sample-site/sample-site.json";
import type { Polygon2D } from "../src/geometry";
import {
    adaptLegacySampleSite,
    adaptSiteProject,
    adaptSiteSnapshot,
    SITE_DATA_UNAVAILABLE,
    type SiteProjectLike,
} from "../src/model/siteSnapshot";

function rect(x1: number, y1: number, x2: number, y2: number): Polygon2D {
    return [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
    ];
}

test("legacy sample adapter maps only rule-listed neighbours and keeps supply zones out", () => {
    const result = adaptLegacySampleSite(sampleSite, rect(0, 0, 90, 72));
    expect(result.isOk).toBe(true);
    if (!result.isOk) throw new Error(result.error);

    expect(result.value.neighbours.map((neighbour) => neighbour.id)).toEqual(["nb_east", "nb_north"]);
    expect(result.value.neighbours.find((neighbour) => neighbour.id === "nb_north")?.rule).toBe(
        "no_oversail",
    );
    expect(result.value.neighbours.find((neighbour) => neighbour.id === "nb_east")?.rule).toBe(
        "oversail_by_permission",
    );
    expect(result.value.neighbours.map((neighbour) => neighbour.id)).not.toContain("rebar_yard");
    expect(result.value.noGoZones).toHaveLength(1);
    expect(result.value.noGoZones[0].id).toBe("well");
    expect(result.value.road?.yFromM).toBe(-20);
    expect(result.value.powerLine?.clearanceM).toBe(6);
    expect(result.value.powerLine?.indicative).toBe(true);
});

test("legacy sample adapter exposes building heights for T9 and excludes supply zones", () => {
    // Hand-worked source values from sample-site.json: Tower A 75 m and the
    // podium 9 m are separate footprints. The T9 check takes the tallest roof
    // (75 m), not 75 + 9.
    const result = adaptLegacySampleSite(sampleSite, rect(0, 0, 90, 72));
    expect(result.isOk).toBe(true);
    if (!result.isOk) throw new Error(result.error);

    const buildings = result.value.buildings ?? [];
    expect(buildings.find((building) => building.id === "tower_a")?.heightM).toBe(75);
    expect(buildings.find((building) => building.id === "podium")?.heightM).toBe(9);
    expect(buildings.find((building) => building.id === "tower_b")?.heightM).toBe(45);
    expect(buildings.map((building) => building.id)).not.toContain("rebar_yard");
    expect(buildings.map((building) => building.id)).not.toContain("formwork");
    expect(buildings.map((building) => building.id)).not.toContain("pump");
});

test("v1 adapter keeps supplied heights and marks missing heights as unavailable", () => {
    const result = adaptSiteProject({
        schema_version: "1.0",
        boundary: { polygon: rect(0, 0, 90, 72) },
        buildings: {
            tower_a: { id: "tower_a", label: "TOWER A", polygon: rect(25, 20, 65, 42), height_m: 75 },
            school: { id: "school", label: "SCHOOL", polygon: rect(8, 78, 52, 96) },
        },
        no_oversail: [],
        oversail_by_permission: [],
    });
    expect(result.isOk).toBe(true);
    if (!result.isOk) throw new Error(result.error);

    expect(result.value.buildings?.find((building) => building.id === "tower_a")?.heightM).toBe(75);
    expect(result.value.buildings?.find((building) => building.id === "school")?.heightM).toBeUndefined();
});

test("legacy sample adapter refuses to invent a boundary polygon", () => {
    // The legacy sample has plot width/depth but no boundary vertex list. Deriving
    // one would invent geometry, so the adapter must report unavailable site data.
    const result = adaptLegacySampleSite(sampleSite);
    expect(result.isOk).toBe(false);
    expect(result.error).toContain(SITE_DATA_UNAVAILABLE);
    expect(result.error).toContain("boundary polygon");
});

test("v1 adapter reads boundary, rule arrays, no-go zones, road and power line", () => {
    const project: SiteProjectLike = {
        schema_version: "1.0",
        boundary: { polygon: rect(0, 0, 90, 72), source: "survey" },
        buildings: {
            school: {
                id: "school",
                label: "SCHOOL",
                polygon: rect(8, 78, 52, 96),
                isNeighbour: true,
                neighbourRule: "no_oversail",
            },
            laydown: {
                id: "laydown",
                label: "S1 REBAR YARD",
                polygon: rect(18, 2, 34, 9),
            },
        },
        no_go_zones: [{ id: "well", label: "well", center: { x: 7, y: 64 }, radius_m: 4 }],
        road: { y_from_m: -20, y_to_m: -2, rule: "no load over carriageway" },
        power_line: {
            x_m: -9,
            clearance_m: 6,
            voltage_kv: 22,
            clearance_note: "INDICATIVE sample value",
        },
        no_oversail: ["school"],
        oversail_by_permission: [],
    };

    const result = adaptSiteProject(project);
    expect(result.isOk).toBe(true);
    if (!result.isOk) throw new Error(result.error);

    expect(result.value.boundary.source).toBe("survey");
    expect(result.value.neighbours).toHaveLength(1);
    expect(result.value.neighbours[0].id).toBe("school");
    expect(result.value.neighbours[0].displayName).toBe("the school");
    expect(result.value.noGoZones[0].center).toEqual({ x: 7, y: 64 });
    expect(result.value.road?.rule).toBe("no load over carriageway");
    expect(result.value.powerLine?.sourceNote).toBe("INDICATIVE sample value");
});

test("v1 adapter fails when a rule references a missing building", () => {
    const project: SiteProjectLike = {
        schema_version: "1.0",
        boundary: { polygon: rect(0, 0, 90, 72) },
        buildings: {},
        no_oversail: ["missing"],
        oversail_by_permission: [],
    };

    const result = adaptSiteProject(project);
    expect(result.isOk).toBe(false);
    expect(result.error).toContain("neighbour 'missing'");
});

test("site snapshot adapter dispatches v1 data and legacy data", () => {
    const v1 = adaptSiteSnapshot({
        schema_version: "1.0",
        boundary: { polygon: rect(0, 0, 90, 72), source: "survey" },
        buildings: {},
        no_oversail: [],
        oversail_by_permission: [],
    });
    expect(v1.isOk).toBe(true);

    const legacy = adaptSiteSnapshot(sampleSite, rect(0, 0, 90, 72));
    expect(legacy.isOk).toBe(true);
    if (!legacy.isOk) throw new Error(legacy.error);
    expect(legacy.value.neighbours).toHaveLength(2);
});
