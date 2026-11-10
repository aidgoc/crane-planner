// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { expect, test } from "@rstest/core";
import type { Polygon2D } from "../src/geometry";
import { evaluateOversailChecks } from "../src/model/oversailChecks";
import type { OversailSite } from "../src/model/oversailTypes";

function rect(x1: number, y1: number, x2: number, y2: number): Polygon2D {
    return [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
    ];
}

function site(overrides: Partial<OversailSite> = {}): OversailSite {
    return {
        boundary: { polygon: rect(-1000, -1000, 1000, 1000), source: "test boundary" },
        neighbours: [],
        noGoZones: [],
        ...overrides,
    };
}

function find(result: ReturnType<typeof evaluateOversailChecks>, id: string) {
    const match = result.results.find((item) => item.id === id);
    if (!match) throw new Error(`missing check: ${id}`);
    return match;
}

test("boundary oversail is the swing radius minus the mast distance to the edge", () => {
    // Hand-worked: mast (30,40), radius 40 m, west boundary x = 0.
    // Distance to boundary = 30 m -> oversail = 40 - 30 = 10.0 m.
    const report = evaluateOversailChecks({
        mast: { x: 30, y: 40 },
        swingRadiusM: 40,
        site: site({ boundary: { polygon: rect(0, 0, 90, 100), source: "test" } }),
    });

    const boundary = find(report, "boundary");
    expect(boundary.status).toBe("fail");
    expect(boundary.oversailDepthM).toBeCloseTo(10, 10);
    expect(boundary.message).toContain("Jib oversails site boundary by 10.0 m");
    expect(report.overallStatus).toBe("fail");
});

test("a jib that exactly touches the boundary passes", () => {
    // Hand-worked: mast (30,40), radius 30 m, west boundary x = 0 -> oversail 0.
    const report = evaluateOversailChecks({
        mast: { x: 30, y: 40 },
        swingRadiusM: 30,
        site: site({ boundary: { polygon: rect(0, 0, 90, 100), source: "test" } }),
    });

    expect(find(report, "boundary").status).toBe("pass");
    expect(find(report, "boundary").oversailDepthM).toBe(0);
    expect(report.overallStatus).toBe("pass");
});

test("road oversail uses the nearest horizontal road edge", () => {
    // Hand-worked: mast (30,30), radius 40 m, road band y = -20..-2.
    // Nearest edge y = -2 -> distance 32 m -> oversail 40 - 32 = 8.0 m.
    const report = evaluateOversailChecks({
        mast: { x: 30, y: 30 },
        swingRadiusM: 40,
        site: site({
            road: { yFromM: -20, yToM: -2, rule: "no load over carriageway" },
        }),
    });

    const road = find(report, "road");
    expect(road.status).toBe("fail");
    expect(road.oversailDepthM).toBeCloseTo(8, 10);
    expect(road.message).toContain("Jib oversails road by 8.0 m (no load over carriageway).");
});

test("power line compares available distance with jib radius plus clearance", () => {
    // Hand-worked: mast (30,40), line x = -9, so available = 30 + 9 = 39 m.
    // Required = radius 40 + clearance 6 = 46 m -> shortfall = 7.0 m.
    const report = evaluateOversailChecks({
        mast: { x: 30, y: 40 },
        swingRadiusM: 40,
        site: site({
            powerLine: {
                xM: -9,
                clearanceM: 6,
                voltageKv: 22,
                sourceNote: "INDICATIVE sample value; source is the local electricity authority",
                indicative: true,
            },
        }),
    });

    const power = find(report, "power_line");
    expect(power.status).toBe("fail");
    expect(power.availableM).toBeCloseTo(39, 10);
    expect(power.requiredM).toBeCloseTo(46, 10);
    expect(power.message).toContain("Power line clearance short by 7.0 m");
    expect(power.message).toContain("INDICATIVE");
});

test("school oversail is a fail with the no-oversail wording", () => {
    // Hand-worked: mast (30,40), radius 40 m, school south edge y = 78.
    // Nearest point (30,78) -> distance 38 m -> oversail = 2.0 m.
    const report = evaluateOversailChecks({
        mast: { x: 30, y: 40 },
        swingRadiusM: 40,
        site: site({
            neighbours: [
                {
                    id: "nb_north",
                    label: "NEIGHBOUR - SCHOOL  12.0 m  (NO OVERSAIL)",
                    displayName: "the school",
                    polygon: rect(8, 78, 52, 96),
                    rule: "no_oversail",
                },
            ],
        }),
    });

    const school = find(report, "neighbour:nb_north");
    expect(school.status).toBe("fail");
    expect(school.oversailDepthM).toBeCloseTo(2, 10);
    expect(school.message).toContain("Jib oversails the school by 2.0 m, no oversail permitted");
});

test("permission oversail is reported separately from a hard fail", () => {
    // Hand-worked: mast (70,30), radius 40 m, east neighbour west edge x = 96.
    // Nearest point (96,30) -> distance 26 m -> oversail = 14.0 m.
    const report = evaluateOversailChecks({
        mast: { x: 70, y: 30 },
        swingRadiusM: 40,
        site: site({
            neighbours: [
                {
                    id: "nb_east",
                    label: "NEIGHBOUR - RESIDENTIAL  30.0 m",
                    displayName: "the residential",
                    polygon: rect(96, 8, 122, 42),
                    rule: "oversail_by_permission",
                },
            ],
        }),
    });

    const neighbour = find(report, "neighbour:nb_east");
    expect(neighbour.status).toBe("permission_needed");
    expect(neighbour.oversailDepthM).toBeCloseTo(14, 10);
    expect(neighbour.message).toContain("Jib oversails the residential by 14.0 m; permission needed");
    expect(report.overallStatus).toBe("permission_needed");
});

test("no-go zone reports circle overlap", () => {
    // Hand-worked: mast (7,40), radius 40 m, well centre (7,64), well radius 4 m.
    // Centre distance 24 m -> overlap = 40 + 4 - 24 = 20.0 m.
    const report = evaluateOversailChecks({
        mast: { x: 7, y: 40 },
        swingRadiusM: 40,
        site: site({
            noGoZones: [{ id: "well", label: "well", center: { x: 7, y: 64 }, radiusM: 4 }],
        }),
    });

    const well = find(report, "no_go:well");
    expect(well.status).toBe("fail");
    expect(well.oversailDepthM).toBeCloseTo(20, 10);
    expect(well.message).toContain("Jib overlaps no-go zone 'well' by 20.0 m.");
});

test("a hard fail outranks a permission request in the overall status", () => {
    const report = evaluateOversailChecks({
        mast: { x: 30, y: 40 },
        swingRadiusM: 40,
        site: site({
            boundary: { polygon: rect(0, 0, 90, 100), source: "test" },
            neighbours: [
                {
                    id: "nb_east",
                    label: "NEIGHBOUR - RESIDENTIAL  30.0 m",
                    displayName: "the residential",
                    polygon: rect(60, 8, 80, 42),
                    rule: "oversail_by_permission",
                },
            ],
        }),
    });

    expect(find(report, "neighbour:nb_east").status).toBe("permission_needed");
    expect(find(report, "boundary").status).toBe("fail");
    expect(report.overallStatus).toBe("fail");
});
