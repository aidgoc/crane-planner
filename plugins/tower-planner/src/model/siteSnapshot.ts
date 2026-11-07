// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Result } from "@chili3d/core";
import type { Point2D, Polygon2D } from "../geometry";
import type {
    OversailNeighbour,
    OversailNoGoZone,
    OversailPowerLine,
    OversailRoad,
    OversailSite,
    SiteBuilding,
} from "./oversailTypes";

export const SITE_DATA_UNAVAILABLE = "Site data unavailable";

interface BuildingLike {
    readonly id?: string;
    readonly label?: string;
    readonly polygon?: unknown;
    readonly layer?: string;
    readonly height_m?: unknown;
    readonly isNeighbour?: boolean;
    readonly neighbourRule?: "no_oversail" | "oversail_by_permission";
}

export interface SiteProjectLike {
    readonly schema_version?: string;
    readonly boundary?: { readonly polygon?: unknown; readonly source?: string };
    readonly buildings?: Record<string, BuildingLike>;
    readonly no_go_zones?: readonly unknown[];
    readonly road?: { readonly y_from_m?: number; readonly y_to_m?: number; readonly rule?: string };
    readonly power_line?: {
        readonly x_m?: number;
        readonly clearance_m?: number;
        readonly voltage_kv?: number;
        readonly clearance_note?: string;
    };
    readonly no_oversail?: readonly string[];
    readonly oversail_by_permission?: readonly string[];
}

function isObject(value: unknown): value is object {
    return typeof value === "object" && value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return isObject(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function read<T = unknown>(record: Record<string, unknown>, key: string): T | undefined {
    return record[key] as T | undefined;
}

function toPolygon(value: unknown): Polygon2D | undefined {
    if (!Array.isArray(value) || value.length < 3) return undefined;
    const polygon: Point2D[] = [];
    for (const point of value) {
        if (Array.isArray(point) && isFiniteNumber(point[0]) && isFiniteNumber(point[1])) {
            polygon.push({ x: point[0], y: point[1] });
        } else if (isRecord(point)) {
            const x = read(point, "x");
            const y = read(point, "y");
            if (!isFiniteNumber(x) || !isFiniteNumber(y)) return undefined;
            polygon.push({ x, y });
        } else {
            return undefined;
        }
    }
    return polygon;
}

function stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
}

export function neighbourDisplayName(label: string, id: string): string {
    let text = label.trim();
    text = text.replace(/^neighbour\s*[-–:]\s*/i, "");
    text = text.replace(/\([^)]*\)/g, " ");
    text = text.replace(/\bG\+\d+\b/gi, " ");
    text = text.replace(/\b\d+(?:\.\d+)?\s*m\b/gi, " ");
    text = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) {
        text = id.toLowerCase().replace(/_/g, " ");
    }
    return text.startsWith("the ") ? text : `the ${text}`;
}

function adaptNoGoZones(zones: unknown): Result<OversailNoGoZone[], string> {
    if (zones === undefined) return Result.ok([]);
    if (!Array.isArray(zones)) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: no-go zones must be an array.`);
    }

    const mapped: OversailNoGoZone[] = [];
    for (const zone of zones) {
        if (!isRecord(zone)) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: no-go zone is missing its centre.`);
        }
        const center = read(zone, "center");
        if (!isRecord(center)) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: no-go zone is missing its centre.`);
        }
        const id = read(zone, "id");
        if (typeof id !== "string" || !id) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: no-go zone is missing its id.`);
        }
        const x = read(center, "x");
        const y = read(center, "y");
        const radiusM = read(zone, "radius_m");
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(radiusM) || radiusM <= 0) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: no-go zone '${id}' has invalid geometry.`);
        }
        const label = read(zone, "label");
        mapped.push({
            id,
            label: typeof label === "string" && label.trim() ? label : id,
            center: { x, y },
            radiusM,
        });
    }
    return Result.ok(mapped);
}

function adaptRoad(value: unknown): Result<OversailRoad | undefined, string> {
    if (value === undefined) return Result.ok(undefined);
    if (!isRecord(value)) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: road data must be an object.`);
    }
    const yFromM = read(value, "y_from_m");
    const yToM = read(value, "y_to_m");
    const rule = read(value, "rule");
    if (!isFiniteNumber(yFromM) || !isFiniteNumber(yToM) || yFromM === yToM) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: road data has invalid extents.`);
    }
    if (typeof rule !== "string" || !rule.trim()) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: road data is missing its restriction rule.`);
    }
    return Result.ok({ yFromM, yToM, rule });
}

function adaptPowerLine(value: unknown): Result<OversailPowerLine | undefined, string> {
    if (value === undefined) return Result.ok(undefined);
    if (!isRecord(value)) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: power-line data must be an object.`);
    }
    const xM = read(value, "x_m");
    const clearanceM = read(value, "clearance_m");
    if (!isFiniteNumber(xM) || !isFiniteNumber(clearanceM) || clearanceM < 0) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: power-line data has invalid geometry or clearance.`);
    }
    const noteValue = read(value, "clearance_note");
    const note = typeof noteValue === "string" ? noteValue.trim() : "";
    const sourceNote = note || "INDICATIVE — no source note supplied";
    const voltageKv = read(value, "voltage_kv");
    return Result.ok({
        xM,
        clearanceM,
        voltageKv: isFiniteNumber(voltageKv) ? voltageKv : undefined,
        sourceNote,
        indicative: !note || /indicat/i.test(sourceNote),
    });
}

function adaptBuildings(buildings: Record<string, BuildingLike>): SiteBuilding[] {
    const mapped: SiteBuilding[] = [];
    for (const [id, building] of Object.entries(buildings)) {
        if (building.layer === "SUPPLY_ZONE") continue;
        const label = building.label;
        mapped.push({
            id,
            label: typeof label === "string" && label.trim() ? label : id,
            heightM: isFiniteNumber(building.height_m) ? building.height_m : undefined,
        });
    }
    return mapped;
}

function adaptNeighbours(
    buildings: Record<string, BuildingLike>,
    noOversailIds: readonly string[],
    permissionIds: readonly string[],
): Result<OversailNeighbour[], string> {
    const rules = new Map<string, "no_oversail" | "oversail_by_permission">();
    for (const id of permissionIds) rules.set(id, "oversail_by_permission");
    for (const id of noOversailIds) rules.set(id, "no_oversail");

    const neighbours: OversailNeighbour[] = [];
    for (const [id, rule] of rules) {
        const building = buildings[id];
        if (!building) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: neighbour '${id}' is missing from buildings.`);
        }
        const polygon = toPolygon(building.polygon);
        if (!polygon) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: neighbour '${id}' has no valid polygon.`);
        }
        const label = building.label ?? id;
        neighbours.push({
            id,
            label,
            displayName: neighbourDisplayName(label, id),
            polygon,
            rule,
        });
    }
    return Result.ok(neighbours);
}

export function adaptSiteProject(project: SiteProjectLike): Result<OversailSite, string> {
    if (!isObject(project)) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: site project must be an object.`);
    }

    const boundaryPolygon = toPolygon(project.boundary?.polygon);
    if (!boundaryPolygon) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: site boundary polygon is required.`);
    }

    const neighbours = adaptNeighbours(
        project.buildings ?? {},
        project.no_oversail ?? [],
        project.oversail_by_permission ?? [],
    );
    if (!neighbours.isOk) return Result.err(neighbours.error);

    const noGoZones = adaptNoGoZones(project.no_go_zones);
    if (!noGoZones.isOk) return Result.err(noGoZones.error);

    const road = adaptRoad(project.road);
    if (!road.isOk) return Result.err(road.error);

    const powerLine = adaptPowerLine(project.power_line);
    if (!powerLine.isOk) return Result.err(powerLine.error);

    return Result.ok({
        boundary: {
            polygon: boundaryPolygon,
            source: project.boundary?.source ?? "site boundary polygon",
        },
        neighbours: neighbours.value,
        noGoZones: noGoZones.value,
        buildings: adaptBuildings(project.buildings ?? {}),
        road: road.value,
        powerLine: powerLine.value,
    });
}

export function adaptLegacySampleSite(
    input: unknown,
    boundaryPolygon?: Polygon2D,
): Result<OversailSite, string> {
    if (!isRecord(input)) {
        return Result.err(`${SITE_DATA_UNAVAILABLE}: legacy sample site must be an object.`);
    }
    if (!boundaryPolygon || boundaryPolygon.length < 3) {
        return Result.err(
            `${SITE_DATA_UNAVAILABLE}: boundary polygon is required; legacy sample data does not contain one.`,
        );
    }

    const rawFootprints = read(input, "footprints");
    const footprints = isRecord(rawFootprints) ? rawFootprints : {};
    const buildings: Record<string, BuildingLike> = {};
    for (const [id, value] of Object.entries(footprints)) {
        if (!isRecord(value)) continue;
        if (read(value, "layer") === "SUPPLY_ZONE") continue;
        const label = read(value, "label");
        buildings[id] = {
            id,
            label: typeof label === "string" ? label : undefined,
            polygon: read(value, "polygon"),
            layer: read(value, "layer"),
            height_m: read(value, "height_m"),
        };
    }

    const neighbours = adaptNeighbours(
        buildings,
        stringArray(read(input, "no_oversail")),
        stringArray(read(input, "oversail_by_permission")),
    );
    if (!neighbours.isOk) return Result.err(neighbours.error);

    const rawNoGoValue = read(input, "no_go");
    const rawNoGo = Array.isArray(rawNoGoValue) ? rawNoGoValue : [];
    const noGoZones: OversailNoGoZone[] = [];
    for (const zone of rawNoGo) {
        if (!isRecord(zone)) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: legacy no-go zone is missing its centre.`);
        }
        const center = read(zone, "center");
        if (!Array.isArray(center)) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: legacy no-go zone is missing its centre.`);
        }
        const id = read(zone, "id");
        const x = center[0];
        const y = center[1];
        const radiusM = read(zone, "radius_m");
        if (
            typeof id !== "string" ||
            !id ||
            !isFiniteNumber(x) ||
            !isFiniteNumber(y) ||
            !isFiniteNumber(radiusM) ||
            radiusM <= 0
        ) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: legacy no-go zone has invalid geometry.`);
        }
        const label = read(zone, "label");
        noGoZones.push({
            id,
            label: typeof label === "string" && label.trim() ? label : id,
            center: { x, y },
            radiusM,
        });
    }

    let road: OversailRoad | undefined;
    const roadData = read(input, "road");
    if (isRecord(roadData)) {
        const yFromM = read(roadData, "y_from");
        const yToM = read(roadData, "y_to");
        const rule = read(roadData, "rule");
        if (!isFiniteNumber(yFromM) || !isFiniteNumber(yToM) || yFromM === yToM) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: legacy road data has invalid extents.`);
        }
        if (typeof rule !== "string" || !rule.trim()) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: legacy road data is missing its restriction rule.`);
        }
        road = { yFromM, yToM, rule };
    }

    let powerLine: OversailPowerLine | undefined;
    const powerLineData = read(input, "power_line");
    if (isRecord(powerLineData)) {
        const xM = read(powerLineData, "x");
        const clearanceM = read(powerLineData, "clearance_m");
        if (!isFiniteNumber(xM) || !isFiniteNumber(clearanceM) || clearanceM < 0) {
            return Result.err(`${SITE_DATA_UNAVAILABLE}: legacy power-line data is invalid.`);
        }
        const noteValue = read(powerLineData, "clearance_note");
        const note = typeof noteValue === "string" ? noteValue.trim() : "";
        const sourceNote = note || "INDICATIVE — no source note supplied";
        const voltageKv = read(powerLineData, "voltage_kv");
        powerLine = {
            xM,
            clearanceM,
            voltageKv: isFiniteNumber(voltageKv) ? voltageKv : undefined,
            sourceNote,
            indicative: !note || /indicat/i.test(sourceNote),
        };
    }

    return Result.ok({
        boundary: { polygon: boundaryPolygon, source: "supplied boundary polygon" },
        neighbours: neighbours.value,
        noGoZones,
        buildings: adaptBuildings(buildings),
        road,
        powerLine,
    });
}

export function adaptSiteSnapshot(input: unknown, boundaryPolygon?: Polygon2D): Result<OversailSite, string> {
    if (isRecord(input) && read(input, "schema_version") === "1.0") {
        return adaptSiteProject(input);
    }
    return adaptLegacySampleSite(input, boundaryPolygon);
}
