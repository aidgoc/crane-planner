// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// S1/S4 — Bundled Synthetic Sample Site Data
// Owner: Ajit
// ============================================================================

import type { SiteProject } from "./types";
import { REQUIRED_DISCLAIMER } from "./types";

/**
 * Bundled synthetic sample site matching public/sample-site/sample-site.json.
 * Provides an immediate offline fallback so the "Load sample site" command
 * always functions, even if HTTP fetch of public assets fails or is unavailable.
 */
export const SAMPLE_SITE_PROJECT: SiteProject = {
    schema_version: "1.0",
    name: "DGOC sample site (synthetic)",
    disclaimer: REQUIRED_DISCLAIMER,
    units: "m",
    origin: "SW corner of plot = (0,0); +x east, +y north",
    boundary: {
        layer: "SITE_BOUNDARY",
        width_m: 90.0,
        depth_m: 72.0,
        ne_corner_arc_r: 10.0,
        elements: [],
        polygon: [
            { x: 0, y: 0 },
            { x: 90, y: 0 },
            { x: 90, y: 62 },
            { x: 80, y: 72 },
            { x: 0, y: 72 },
        ],
        area_m2: 6458.54,
    },
    buildings: {
        tower_a: {
            id: "tower_a",
            layer: "BUILDING_PROPOSED",
            label: "TOWER A  G+24  75.0 m",
            polygon: [
                { x: 25, y: 20 },
                { x: 65, y: 20 },
                { x: 65, y: 42 },
                { x: 25, y: 42 },
            ],
            height_m: 75.0,
            source: "sample-site.json",
        },
        podium: {
            id: "podium",
            layer: "BUILDING_PROPOSED",
            label: "PODIUM  2 levels  9.0 m",
            polygon: [
                { x: 15, y: 12 },
                { x: 75, y: 12 },
                { x: 75, y: 50 },
                { x: 15, y: 50 },
            ],
            height_m: 9.0,
            source: "sample-site.json",
        },
        tower_b: {
            id: "tower_b",
            layer: "BUILDING_PROPOSED",
            label: "TOWER B  G+14  45.0 m",
            polygon: [
                { x: 50, y: 54 },
                { x: 70, y: 54 },
                { x: 70, y: 68 },
                { x: 50, y: 68 },
            ],
            height_m: 45.0,
            source: "sample-site.json",
        },
        site_office: {
            id: "site_office",
            layer: "TEMP_WORKS",
            label: "SITE OFFICE  3.0 m",
            polygon: [
                { x: 76, y: 56 },
                { x: 86, y: 56 },
                { x: 86, y: 66 },
                { x: 76, y: 66 },
            ],
            height_m: 3.0,
            source: "sample-site.json",
        },
        nb_east: {
            id: "nb_east",
            layer: "NEIGHBOUR",
            label: "NEIGHBOUR - RESIDENTIAL  30.0 m",
            polygon: [
                { x: 96, y: 8 },
                { x: 122, y: 8 },
                { x: 122, y: 42 },
                { x: 96, y: 42 },
            ],
            height_m: 30.0,
            source: "sample-site.json",
            isNeighbour: true,
            neighbourRule: "oversail_by_permission",
        },
        nb_north: {
            id: "nb_north",
            layer: "NEIGHBOUR",
            label: "NEIGHBOUR - SCHOOL  12.0 m (NO OVERSAIL)",
            polygon: [
                { x: 8, y: 78 },
                { x: 52, y: 78 },
                { x: 52, y: 96 },
                { x: 8, y: 96 },
            ],
            height_m: 12.0,
            source: "sample-site.json",
            isNeighbour: true,
            neighbourRule: "no_oversail",
        },
    },
    supply_zones: {
        rebar_yard: {
            id: "rebar_yard",
            layer: "SUPPLY_ZONE",
            label: "S1 REBAR YARD",
            polygon: [
                { x: 18, y: 2 },
                { x: 34, y: 2 },
                { x: 34, y: 9 },
                { x: 18, y: 9 },
            ],
            height_m: 0.0,
        },
        formwork: {
            id: "formwork",
            layer: "SUPPLY_ZONE",
            label: "S2 FORMWORK STORE",
            polygon: [
                { x: 78, y: 4 },
                { x: 88, y: 4 },
                { x: 88, y: 22 },
                { x: 78, y: 22 },
            ],
            height_m: 0.0,
        },
        pump: {
            id: "pump",
            layer: "SUPPLY_ZONE",
            label: "S3 CONCRETE PUMP / BUCKET FILL",
            polygon: [
                { x: 2, y: 38 },
                { x: 10, y: 38 },
                { x: 10, y: 52 },
                { x: 2, y: 52 },
            ],
            height_m: 0.0,
        },
    },
    no_go_zones: [
        {
            id: "well",
            label: "Heritage Well (No-Go)",
            center: { x: 7.0, y: 64.0 },
            radius_m: 4.0,
            source: "sample-site.json",
        },
    ],
    road: {
        layer: "ROAD",
        y_from_m: -20.0,
        y_to_m: -2.0,
        rule: "no load over carriageway",
    },
    power_line: {
        layer: "POWER_LINE",
        x_m: -9.0,
        voltage_kv: 22,
        clearance_m: 6.0,
        clearance_note: "INDICATIVE sample value; the real figure comes from the local electricity authority",
    },
    no_oversail: ["nb_north"],
    oversail_by_permission: ["nb_east"],
    picks: [
        {
            id: "P1",
            what: "rebar bundle",
            load_t: 2.0,
            from: "S1",
            from_xy: [26, 5.5],
            to_xy: [62, 39],
        },
        {
            id: "P2",
            what: "formwork panel",
            load_t: 1.5,
            from: "S2",
            from_xy: [83, 13],
            to_xy: [28, 23],
        },
        {
            id: "P3",
            what: "concrete bucket (full)",
            load_t: 2.6,
            from: "S3",
            from_xy: [6, 45],
            to_xy: [64, 41],
        },
        {
            id: "P4",
            what: "MEP plant skid (heaviest)",
            load_t: 4.2,
            from: "S1",
            from_xy: [33, 8],
            to_xy: [38, 25],
        },
        {
            id: "P5",
            what: "tower B rebar bundle (farthest)",
            load_t: 1.8,
            from: "S2",
            from_xy: [85, 20],
            to_xy: [68, 66],
        },
    ],
};
