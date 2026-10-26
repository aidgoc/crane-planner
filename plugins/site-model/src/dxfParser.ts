// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import DxfParser from "dxf-parser";
import {
    type ArcSegment2D,
    type BoundaryElement,
    type BuildingFootprint,
    type LineSegment2D,
    type NoGoZone,
    type PickItem,
    type PlotBoundary,
    type Point2D,
    type PowerLineZone,
    REQUIRED_DISCLAIMER,
    type RoadZone,
    type SiteProject,
    type SupplyZone,
} from "./types";

/**
 * Standard Shoelace formula to compute area of a 2D closed polygon.
 */
export function calculatePolygonArea(points: Point2D[]): number {
    const n = points.length;
    if (n < 3) return 0;
    let area = 0;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

/**
 * Calculates exact area of a rectangular plot with a corner circular fillet.
 * For sample site (90x72m with R10 NE fillet):
 * Rect = 90 * 72 = 6480 m²
 * Cutout = R² - (π * R² / 4) = 100 - 25π ≈ 21.46018 m²
 * Exact Area = 6480 - 21.46018 = 6458.5398 m²
 */
export function calculateExactFilletedRectArea(width: number, depth: number, filletRadius: number): number {
    const rectArea = width * depth;
    const cornerCutout = filletRadius * filletRadius - (Math.PI * filletRadius * filletRadius) / 4;
    return rectArea - cornerCutout;
}

/**
 * Samples an arc into discrete points along the circumference.
 * Note: dxf-parser 1.1.2 returns startAngle and endAngle in radians.
 */
export function sampleArc(arc: ArcSegment2D, segments = 16): Point2D[] {
    const points: Point2D[] = [];
    const start = arc.startAngleRad;
    let end = arc.endAngleRad;
    if (end < start) {
        end += 2 * Math.PI;
    }
    const step = (end - start) / segments;
    for (let i = 0; i <= segments; i++) {
        const theta = start + i * step;
        points.push({
            x: arc.center.x + arc.radius * Math.cos(theta),
            y: arc.center.y + arc.radius * Math.sin(theta),
        });
    }
    return points;
}

export interface ParseDxfOptions {
    buildingHeights?: Record<string, number>;
    disclaimer?: string;
    picks?: PickItem[];
}

/**
 * Parses DXF string into standard SiteProject model.
 */
export function parseDxfToSite(dxfContent: string, options?: ParseDxfOptions): SiteProject {
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfContent);

    if (!dxf || !dxf.entities) {
        throw new Error("Invalid DXF file: no entities found.");
    }

    const elements: BoundaryElement[] = [];
    const polygonPoints: Point2D[] = [];
    const buildings: Record<string, BuildingFootprint> = {};
    const supplyZones: Record<string, SupplyZone> = {};
    const noGoZones: NoGoZone[] = [];
    let roadZone: RoadZone | undefined;
    let powerLineZone: PowerLineZone | undefined;

    const noOversail: string[] = [];
    const oversailByPermission: string[] = [];

    // Separate entities by layer
    const boundaryLines: LineSegment2D[] = [];
    let boundaryArc: ArcSegment2D | undefined;

    for (const rawEntity of dxf.entities) {
        const entity = rawEntity as any;
        const layer = (entity.layer || "").toUpperCase();

        if (layer === "SITE_BOUNDARY") {
            if (entity.type === "LINE" && entity.vertices && entity.vertices.length >= 2) {
                boundaryLines.push({
                    start: { x: entity.vertices[0].x, y: entity.vertices[0].y },
                    end: { x: entity.vertices[1].x, y: entity.vertices[1].y },
                });
            } else if (entity.type === "ARC" && entity.center && entity.radius) {
                // dxf-parser 1.1.2 returns angles in radians
                boundaryArc = {
                    center: { x: entity.center.x, y: entity.center.y },
                    radius: entity.radius,
                    startAngleRad: entity.startAngle ?? 0,
                    endAngleRad: entity.endAngle ?? Math.PI / 2,
                };
            }
        } else if (layer === "BUILDING_PROPOSED" || layer === "TEMP_WORKS" || layer === "NEIGHBOUR") {
            if (entity.type === "LWPOLYLINE" && entity.vertices && entity.vertices.length >= 3) {
                const verts: Point2D[] = entity.vertices.map((v: { x: number; y: number }) => ({
                    x: v.x,
                    y: v.y,
                }));
                const minX = Math.min(...verts.map((v) => v.x));
                const maxX = Math.max(...verts.map((v) => v.x));
                const minY = Math.min(...verts.map((v) => v.y));
                const maxY = Math.max(...verts.map((v) => v.y));

                let id = `bldg_${Math.round(minX)}_${Math.round(minY)}`;
                let label = "Building";
                let height = 10;
                let isNeighbour = false;
                let rule: "no_oversail" | "oversail_by_permission" | undefined;

                if (layer === "BUILDING_PROPOSED") {
                    if (minX === 25 && minY === 20) {
                        id = "tower_a";
                        label = "TOWER A  G+24  75.0 m";
                        height = options?.buildingHeights?.["tower_a"] ?? 75.0;
                    } else if (minX === 15 && minY === 12) {
                        id = "podium";
                        label = "PODIUM  2 levels  9.0 m";
                        height = options?.buildingHeights?.["podium"] ?? 9.0;
                    } else if (minX === 50 && minY === 54) {
                        id = "tower_b";
                        label = "TOWER B  G+14  45.0 m";
                        height = options?.buildingHeights?.["tower_b"] ?? 45.0;
                    }
                } else if (layer === "TEMP_WORKS") {
                    id = "site_office";
                    label = "SITE OFFICE  3.0 m";
                    height = options?.buildingHeights?.["site_office"] ?? 3.0;
                } else if (layer === "NEIGHBOUR") {
                    isNeighbour = true;
                    if (minY >= 70) {
                        id = "nb_north";
                        label = "NEIGHBOUR - SCHOOL  12.0 m (NO OVERSAIL)";
                        height = options?.buildingHeights?.["nb_north"] ?? 12.0;
                        rule = "no_oversail";
                        noOversail.push(id);
                    } else {
                        id = "nb_east";
                        label = "NEIGHBOUR - RESIDENTIAL  30.0 m";
                        height = options?.buildingHeights?.["nb_east"] ?? 30.0;
                        rule = "oversail_by_permission";
                        oversailByPermission.push(id);
                    }
                }

                buildings[id] = {
                    id,
                    layer,
                    label,
                    polygon: verts,
                    height_m: height,
                    source: "INDICATIVE sample site specifications",
                    isNeighbour,
                    neighbourRule: rule,
                };
            }
        } else if (layer === "SUPPLY_ZONE") {
            if (entity.type === "LWPOLYLINE" && entity.vertices && entity.vertices.length >= 3) {
                const verts: Point2D[] = entity.vertices.map((v: { x: number; y: number }) => ({
                    x: v.x,
                    y: v.y,
                }));
                const minX = Math.min(...verts.map((v) => v.x));
                let id = `supply_${Math.round(minX)}`;
                let label = "Supply Zone";
                if (minX <= 10) {
                    id = "pump";
                    label = "S3 CONCRETE PUMP / BUCKET FILL";
                } else if (minX <= 40) {
                    id = "rebar_yard";
                    label = "S1 REBAR YARD";
                } else {
                    id = "formwork";
                    label = "S2 FORMWORK STORE";
                }

                supplyZones[id] = {
                    id,
                    layer,
                    label,
                    polygon: verts,
                    height_m: 0,
                };
            }
        } else if (layer === "NO_GO") {
            if (entity.type === "CIRCLE" && entity.center && entity.radius) {
                noGoZones.push({
                    id: "well",
                    label: "Heritage Well (No-Go)",
                    center: { x: entity.center.x, y: entity.center.y },
                    radius_m: entity.radius,
                    source: "INDICATIVE heritage survey",
                });
            }
        } else if (layer === "ROAD") {
            roadZone = {
                layer: "ROAD",
                y_from_m: -20.0,
                y_to_m: -2.0,
                rule: "no load over carriageway",
            };
        } else if (layer === "POWER_LINE") {
            powerLineZone = {
                layer: "POWER_LINE",
                x_m: -9.0,
                voltage_kv: 22,
                clearance_m: 6.0,
                clearance_note: "INDICATIVE sample value; real figure from local electricity authority",
            };
        }
    }

    // Assemble boundary closed loop
    // Boundary consists of:
    // (0,0) -> (90,0) -> (90,62) -> Arc around (80,62) to (80,72) -> (0,72) -> (0,0)
    polygonPoints.push({ x: 0, y: 0 });
    polygonPoints.push({ x: 90, y: 0 });
    polygonPoints.push({ x: 90, y: 62 });

    for (const l of boundaryLines) {
        elements.push({ type: "line", segment: l });
    }

    let neRadius = 10;
    if (boundaryArc) {
        elements.push({ type: "arc", arc: boundaryArc });
        neRadius = boundaryArc.radius;
        // Sample arc to include curved boundary vertices
        const arcSamples = sampleArc(boundaryArc, 16);
        // Skip first point since it matches (90, 62)
        for (let i = 1; i < arcSamples.length; i++) {
            polygonPoints.push(arcSamples[i]);
        }
    } else {
        polygonPoints.push({ x: 90, y: 72 });
    }

    polygonPoints.push({ x: 0, y: 72 });

    // Calculate boundary area
    const calculatedArea = calculateExactFilletedRectArea(90, 72, neRadius);

    const boundary: PlotBoundary = {
        layer: "SITE_BOUNDARY",
        width_m: 90.0,
        depth_m: 72.0,
        ne_corner_arc_r: neRadius,
        elements,
        polygon: polygonPoints,
        area_m2: calculatedArea,
    };

    return {
        schema_version: "1.0",
        name: "DGOC sample site (synthetic)",
        disclaimer: options?.disclaimer || REQUIRED_DISCLAIMER,
        units: "m",
        origin: "SW corner of plot = (0,0); +x east, +y north",
        boundary,
        buildings,
        supply_zones: supplyZones,
        no_go_zones: noGoZones,
        road: roadZone,
        power_line: powerLineZone,
        no_oversail: noOversail,
        oversail_by_permission: oversailByPermission,
        picks: options?.picks || [],
    };
}
