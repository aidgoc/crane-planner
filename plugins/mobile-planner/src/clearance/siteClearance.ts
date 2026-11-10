// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Mobile Crane Lift Planner — M6: Boom clearance to site obstacles
// Owner: Abhishek
// ============================================================================

import { type IFace, type IShape, type IShapeFactory, type ISolid, XYZ } from "@chili3d/core";
import type { ClearanceResult } from "./distance";
import { computeClearanceDistance, MM_PER_M } from "./distance";

// ============================================================================
// Public types
// ============================================================================

/**
 * A 2D polygon footprint + height describing a site obstacle (building, etc.).
 * Coordinates are in metres; X = east, Y = north, Z = up.
 */
export interface ObstacleFootprint {
    id: string;
    label: string;
    /** Closed 2D polygon in metres [[x0,y0],[x1,y1],...] */
    polygon: [number, number][];
    height_m: number;
    /** Minimum required clearance to this obstacle in metres. */
    clearanceLimitM: number;
}

/**
 * A vertical power line hazard.
 *
 * Modelled as a thin vertical wall (a face, not a solid) at x_m, spanning ±200 m in Y
 * and 0–200 m in Z (arbitrary large extents). `extremaDistance` then gives the 3D
 * distance from the boom surface to this wall. The status check compares that
 * distance against `clearanceLimitM`.
 *
 * NOTE: The real wire height is not in the site data, so the wall spans the full
 * height. This is conservative: the distance can only be too small, never too large.
 * Whoever shows this result must state the assumption.
 *
 * NOTE: The wall has no volume, so a boom that crosses it is reported as touching
 * (isCollision = false, isTouching = true) with status CRITICAL.
 */
export interface PowerLineObstacle {
    id: string;
    label: string;
    /** X coordinate of the wire in metres (east-positive). */
    x_m: number;
    /** Minimum required clearance in metres (INDICATIVE — regulatory value needed). */
    clearanceLimitM: number;
}

/**
 * Crane boom placement state.
 * All distances in metres, angles in degrees.
 */
export interface BoomPlacement {
    /** Boom foot position in metres (x east, y north, z up). */
    pivotM: { x: number; y: number; z: number };
    /** Boom cylinder radius in metres (an input, not crane data). */
    boomRadiusM: number;
    /** Boom length in metres. */
    boomLengthM: number;
    /**
     * Slew (rotation) angle in degrees.
     * 0° = East (+X), 90° = North (+Y), measured counter-clockwise from +X in plan.
     */
    slewDeg: number;
    /**
     * Elevation angle in degrees above horizontal.
     * 0° = horizontal, 90° = straight up.
     */
    elevationDeg: number;
}

/**
 * Result of checking one obstacle against the current boom placement.
 */
export interface ObstacleClearanceResult {
    obstacleId: string;
    obstacleLabel: string;
    /** Minimum surface-to-surface distance in metres. */
    minDistanceM: number;
    isCollision: boolean;
    isTouching: boolean;
    /** Minimum required safe distance for this obstacle. */
    clearanceLimitM: number;
    /**
     * SAFE     — distance >= clearanceLimitM
     * WARNING  — distance < clearanceLimitM, no contact (shown red, see statusToColour)
     * CRITICAL — collision or touching (shown red)
     */
    status: "SAFE" | "WARNING" | "CRITICAL";
    disclaimer: "Planning aid, not a certified lift plan.";
}

/**
 * Aggregated result across all site obstacles.
 *
 * `worstCase` is `null` when no obstacles were checked (empty buildings array
 * and no power line). An empty report must NOT be treated as SAFE — the caller
 * should surface "no obstacles loaded" to the user.
 */
export interface SiteClearanceReport {
    /** Results for every checked obstacle: most severe status first, then smallest distance. */
    obstacles: ObstacleClearanceResult[];
    /**
     * The single worst result: highest severity, then smallest distance.
     * `null` when no obstacles were checked — do NOT interpret as SAFE.
     */
    worstCase: ObstacleClearanceResult | null;
    /** True if any obstacle is in collision or touching. */
    anyCollision: boolean;
    disclaimer: "Planning aid, not a certified lift plan.";
}

// ============================================================================
// Geometry builders and input guard
// ============================================================================

/**
 * Converts slew + elevation angles to a 3D unit direction vector.
 *
 * Coordinate frame: X = East, Y = North, Z = Up.
 * slew=0° → +X (East), slew=90° → +Y (North).
 * elevation=0° → horizontal, elevation=90° → +Z (straight up).
 *
 * @param slewDeg - Horizontal rotation angle in degrees from East (CCW in plan).
 * @param elevationDeg - Vertical lift angle in degrees above horizontal.
 * @returns Unit direction vector {x, y, z}.
 */
export function boomDirection(slewDeg: number, elevationDeg: number): { x: number; y: number; z: number } {
    const slewRad = (slewDeg * Math.PI) / 180;
    const elevRad = (elevationDeg * Math.PI) / 180;
    const cosElev = Math.cos(elevRad);
    return {
        x: Math.cos(slewRad) * cosElev,
        y: Math.sin(slewRad) * cosElev,
        z: Math.sin(elevRad),
    };
}

/**
 * Validates a BoomPlacement before any factory call.
 *
 * Throws a descriptive RangeError so that invalid values never reach the WASM kernel.
 * Measured with the kernel: a negative length aborts it (RuntimeError "Aborted") when
 * the distance is computed; a zero length gives a degenerate shape (volume 0) and a
 * meaningless distance; an elevation above 90° was accepted and returned a wrong SAFE.
 *
 * Rules:
 *  - boomLengthM  > 0            (negative: kernel abort; zero: degenerate shape)
 *  - boomRadiusM  > 0            (a zero radius is not a real boom)
 *  - elevationDeg ∈ [0, 90]      (>90° is past vertical; <0° is below horizontal)
 *  - slewDeg must be finite       (NaN / Infinity → NaN direction vector)
 *  - pivot coordinates must be finite
 *
 * Planning aid, not a certified lift plan.
 */
export function validateBoomPlacement(boom: BoomPlacement): void {
    if (!Number.isFinite(boom.boomLengthM) || boom.boomLengthM <= 0) {
        throw new RangeError(
            `BoomPlacement.boomLengthM must be > 0 (got ${boom.boomLengthM}). ` +
                `A negative length aborts the WASM kernel; zero gives a degenerate boom.`,
        );
    }
    if (!Number.isFinite(boom.boomRadiusM) || boom.boomRadiusM <= 0) {
        throw new RangeError(
            `BoomPlacement.boomRadiusM must be > 0 (got ${boom.boomRadiusM}). ` +
                `A zero or negative radius is not a real boom.`,
        );
    }
    if (!Number.isFinite(boom.elevationDeg) || boom.elevationDeg < 0 || boom.elevationDeg > 90) {
        throw new RangeError(
            `BoomPlacement.elevationDeg must be in [0, 90] degrees (got ${boom.elevationDeg}). ` +
                `Values > 90° are past vertical; < 0° are below horizontal.`,
        );
    }
    if (!Number.isFinite(boom.slewDeg)) {
        throw new RangeError(
            `BoomPlacement.slewDeg must be a finite number (got ${boom.slewDeg}). ` +
                `NaN or Infinity would produce a NaN direction vector.`,
        );
    }
    for (const [axis, val] of [
        ["pivot.x", boom.pivotM.x],
        ["pivot.y", boom.pivotM.y],
        ["pivot.z", boom.pivotM.z],
    ] as [string, number][]) {
        if (!Number.isFinite(val)) {
            throw new RangeError(`BoomPlacement.${axis} must be finite (got ${val}).`);
        }
    }
}

/**
 * Checks one clearance limit. `owner` names the obstacle in the error message.
 *
 * A NaN or negative limit makes every distance without contact compare as SAFE
 * (`distance < NaN` and `distance < -1` are both false), which is a false all-clear.
 * A limit of 0 is allowed; it switches the WARNING zone off.
 */
function assertClearanceLimit(owner: string, limitM: number): void {
    if (!Number.isFinite(limitM) || limitM < 0) {
        throw new RangeError(
            `${owner}: clearanceLimitM must be a non-negative finite number (got ${limitM}). ` +
                `NaN or negative limits would otherwise return a false SAFE.`,
        );
    }
}

/**
 * Validates a building footprint before any kernel call.
 *
 * Throws a descriptive RangeError, naming the obstacle, so that bad site data is
 * rejected here and not by the kernel.
 *
 * Rules:
 *  - polygon has at least 3 vertices, and every coordinate is finite
 *  - height_m is finite and > 0 (zero: the kernel prism fails; negative: the building is
 *    extruded below ground and the result was a false SAFE)
 *  - clearanceLimitM is finite and >= 0
 *
 * Not checked: a polygon with zero area or crossing edges.
 */
export function validateObstacleFootprint(fp: ObstacleFootprint): void {
    const owner = `ObstacleFootprint(${fp.id})`;
    if (fp.polygon.length < 3) {
        throw new RangeError(`${owner}: polygon must have ≥ 3 vertices (got ${fp.polygon.length}).`);
    }
    for (let i = 0; i < fp.polygon.length; i++) {
        const [x, y] = fp.polygon[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new RangeError(`${owner}: polygon[${i}] must be two finite numbers (got [${x}, ${y}]).`);
        }
    }
    if (!Number.isFinite(fp.height_m) || fp.height_m <= 0) {
        throw new RangeError(`${owner}: height_m must be finite and > 0 (got ${fp.height_m}).`);
    }
    assertClearanceLimit(owner, fp.clearanceLimitM);
}

/**
 * Validates the power-line obstacle before any kernel call.
 *
 * Rules: x_m is finite, and clearanceLimitM is finite and >= 0.
 */
export function validatePowerLineObstacle(pl: PowerLineObstacle): void {
    const owner = `PowerLineObstacle(${pl.id})`;
    if (!Number.isFinite(pl.x_m)) {
        throw new RangeError(`${owner}: x_m must be finite (got ${pl.x_m}).`);
    }
    assertClearanceLimit(owner, pl.clearanceLimitM);
}

/**
 * Builds a 3D boom cylinder solid using the ShapeFactory.
 *
 * The cylinder axis starts at `pivotM` and extends in the direction computed
 * from slewDeg and elevationDeg by boomLengthM metres.
 *
 * Validates inputs before any factory call (throws RangeError on bad values).
 *
 * Units: all inputs in metres; factory calls use mm (×1000).
 */
export function buildBoomSolid(factory: IShapeFactory, boom: BoomPlacement): ISolid {
    validateBoomPlacement(boom);

    const dir = boomDirection(boom.slewDeg, boom.elevationDeg);
    const dirXYZ = new XYZ({ x: dir.x, y: dir.y, z: dir.z });

    const baseMm = new XYZ({
        x: boom.pivotM.x * MM_PER_M,
        y: boom.pivotM.y * MM_PER_M,
        z: boom.pivotM.z * MM_PER_M,
    });

    const res = factory.cylinder(dirXYZ, baseMm, boom.boomRadiusM * MM_PER_M, boom.boomLengthM * MM_PER_M);
    if (!res.isOk) {
        throw new Error(`buildBoomSolid: Failed to create boom cylinder — ${res.error}`);
    }
    return res.value as ISolid;
}

/**
 * Extrudes a 2D polygon footprint into a 3D building solid.
 *
 * Units: polygon vertices and height in metres; factory calls use mm (×1000).
 *
 * @throws RangeError if the footprint is invalid (see validateObstacleFootprint).
 * @throws Error if extrusion fails.
 */
export function buildBuildingSolid(factory: IShapeFactory, footprint: ObstacleFootprint): ISolid {
    validateObstacleFootprint(footprint);

    // Build outline edges in mm
    const edges = [];
    const pts = footprint.polygon;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % n];
        const dx = (x1 - x0) * MM_PER_M;
        const dy = (y1 - y0) * MM_PER_M;
        if (Math.hypot(dx, dy) < 0.001) continue;
        const lineRes = factory.line(
            new XYZ({ x: x0 * MM_PER_M, y: y0 * MM_PER_M, z: 0 }),
            new XYZ({ x: x1 * MM_PER_M, y: y1 * MM_PER_M, z: 0 }),
        );
        if (!lineRes.isOk) throw new Error(`buildBuildingSolid(${footprint.id}): edge ${i} failed`);
        edges.push(lineRes.value);
    }
    if (edges.length < 3) {
        throw new Error(`buildBuildingSolid(${footprint.id}): fewer than 3 valid edges`);
    }

    const wireRes = factory.wire(edges);
    if (!wireRes.isOk) throw new Error(`buildBuildingSolid(${footprint.id}): wire failed`);

    const faceRes = factory.face([wireRes.value as Parameters<typeof factory.face>[0][0]]);
    if (!faceRes.isOk) throw new Error(`buildBuildingSolid(${footprint.id}): face failed`);

    const prismRes = factory.prism(faceRes.value, new XYZ({ x: 0, y: 0, z: footprint.height_m * MM_PER_M }));
    if (!prismRes.isOk) throw new Error(`buildBuildingSolid(${footprint.id}): prism failed`);

    return prismRes.value as ISolid;
}

/**
 * Builds a thin vertical wall face to stand in for a power-line wire.
 *
 * The face is a rectangle at x = pl.x_m, spanning:
 *   Y: −200 m … +200 m   (arbitrary large extent)
 *   Z:    0 m … +200 m   (ground to 200 m; the real wire height is not in the site data)
 *
 * Using a face (not a solid box) means `extremaDistance` returns the distance from
 * the boom to the wall itself, with no extra clearance band added. That distance is
 * then compared against `clearanceLimitM` once, in checkOneClearance.
 *
 * Conservative: the wall is bigger than the real wire, so the distance can only be
 * too small, never too large. The code does not add this note to any result, so the
 * code that shows the result must state it.
 *
 * Units: metres input → mm in factory.
 */
export function buildPowerLineWall(factory: IShapeFactory, pl: PowerLineObstacle): IFace {
    validatePowerLineObstacle(pl);

    // Four corners of the vertical wall at x = pl.x_m (in mm)
    const xMm = pl.x_m * MM_PER_M;
    const yMinMm = -200 * MM_PER_M;
    const yMaxMm = 200 * MM_PER_M;
    const zMinMm = 0;
    const zMaxMm = 200 * MM_PER_M;

    // Build four edges of the rectangle
    const p00 = new XYZ({ x: xMm, y: yMinMm, z: zMinMm });
    const p01 = new XYZ({ x: xMm, y: yMaxMm, z: zMinMm });
    const p11 = new XYZ({ x: xMm, y: yMaxMm, z: zMaxMm });
    const p10 = new XYZ({ x: xMm, y: yMinMm, z: zMaxMm });

    const edges = [];
    for (const [a, b] of [
        [p00, p01],
        [p01, p11],
        [p11, p10],
        [p10, p00],
    ] as [XYZ, XYZ][]) {
        const r = factory.line(a, b);
        if (!r.isOk) throw new Error(`buildPowerLineWall(${pl.id}): edge failed — ${r.error}`);
        edges.push(r.value);
    }

    const wireRes = factory.wire(edges);
    if (!wireRes.isOk) throw new Error(`buildPowerLineWall(${pl.id}): wire failed — ${wireRes.error}`);

    const faceRes = factory.face([wireRes.value as Parameters<typeof factory.face>[0][0]]);
    if (!faceRes.isOk) throw new Error(`buildPowerLineWall(${pl.id}): face failed — ${faceRes.error}`);

    return faceRes.value;
}

// ============================================================================
// Status helpers
// ============================================================================

/**
 * Maps a clearance status to a UI highlight colour.
 *
 * Per BACKLOG M6: "red highlight under the clearance limit, with numeric readout."
 *  - SAFE     → green  (distance ≥ limit)
 *  - WARNING  → red    (distance < limit, but no penetration)
 *  - CRITICAL → red    (collision or touching)
 *  - null / undefined → "none" (no obstacle / empty site; never reports green)
 *
 * Both WARNING and CRITICAL map to red so any sub-limit reading is visually
 * flagged. UI code should use this instead of string-matching status.
 *
 * Planning aid, not a certified lift plan.
 */
export function statusToColour(
    status: ObstacleClearanceResult["status"] | null | undefined,
): "green" | "red" | "none" {
    if (!status) return "none";
    return status === "SAFE" ? "green" : "red";
}

/**
 * Returns true when the result requires a red highlight in the UI
 * (i.e. distance is below the clearance limit, or there is a collision).
 * Returns false if result is null/undefined.
 * Convenience wrapper around statusToColour for conditional rendering.
 */
export function isRedFlag(result: ObstacleClearanceResult | null | undefined): boolean {
    return result ? statusToColour(result.status) === "red" : false;
}

/**
 * Classifies clearance status based on surface distance and clearance limit.
 *
 * Rules:
 *  - clearanceLimitM must be a non-negative finite number (>= 0).
 *    Throws RangeError on NaN, Infinity, or negative values to prevent false SAFE.
 *  - minDistanceM must be a finite number >= 0. Throws RangeError on NaN, Infinity
 *    or negative values (a NaN distance would otherwise compare false and give SAFE).
 *  - isCollision || isTouching → CRITICAL
 *  - minDistanceM < limitM → WARNING
 *  - minDistanceM >= limitM → SAFE
 */
export function statusFor(
    minDistanceM: number,
    isCollision: boolean,
    isTouching: boolean,
    limitM: number,
): ObstacleClearanceResult["status"] {
    assertClearanceLimit("statusFor", limitM);
    if (!Number.isFinite(minDistanceM) || minDistanceM < 0) {
        throw new RangeError(
            `statusFor: minDistanceM must be a finite number >= 0 (got ${minDistanceM}). ` +
                `A bad distance must never be classified SAFE.`,
        );
    }
    if (isCollision || isTouching) return "CRITICAL";
    if (minDistanceM < limitM) return "WARNING";
    return "SAFE";
}

// ============================================================================
// Main public API
// ============================================================================

/**
 * Checks the clearance between a crane boom and a single pre-built obstacle solid.
 *
 * @param boomSolid - Pre-built boom solid (from buildBoomSolid).
 * @param obstacleSolid - Pre-built building solid or power-line wall face.
 * @param meta - Obstacle metadata (id, label, clearance limit).
 * @param factory - ShapeFactory (needed by computeClearanceDistance for booleanCommon).
 * @returns ObstacleClearanceResult.
 */
export function checkOneClearance(
    boomSolid: IShape,
    obstacleSolid: IShape,
    meta: { id: string; label: string; clearanceLimitM: number },
    factory: IShapeFactory,
): ObstacleClearanceResult {
    // Reject an invalid limit before the kernel runs.
    assertClearanceLimit(meta.id, meta.clearanceLimitM);

    const raw: ClearanceResult = computeClearanceDistance(boomSolid, obstacleSolid, factory);
    const status = statusFor(raw.distanceM, raw.isCollision, raw.isTouching, meta.clearanceLimitM);
    return {
        obstacleId: meta.id,
        obstacleLabel: meta.label,
        minDistanceM: raw.distanceM,
        isCollision: raw.isCollision,
        isTouching: raw.isTouching,
        clearanceLimitM: meta.clearanceLimitM,
        status,
        disclaimer: "Planning aid, not a certified lift plan.",
    };
}

/** Frees a CAD shape. Placeholder objects without `dispose` (used in some tests) are skipped. */
function disposeShape(shape: unknown): void {
    (shape as { dispose?: () => void } | null | undefined)?.dispose?.();
}

/**
 * Obstacle solids that are built once and checked against many boom placements
 * (a swing sweep checks the same obstacles at every slew angle).
 * Call `dispose()` when done: the shapes live in the WASM heap and are not
 * freed by the JavaScript garbage collector.
 */
export interface PreparedObstacles {
    items: { solid: IShape; meta: { id: string; label: string; clearanceLimitM: number } }[];
    dispose(): void;
}

/**
 * Validates every obstacle first (so no kernel work is done for an invalid site), then
 * builds the building solids and the power-line wall once.
 * If building one of them fails, the ones already built are freed before the error is thrown.
 */
export function prepareObstacles(
    factory: IShapeFactory,
    buildings: ObstacleFootprint[],
    powerLine?: PowerLineObstacle,
): PreparedObstacles {
    for (const fp of buildings) validateObstacleFootprint(fp);
    if (powerLine) validatePowerLineObstacle(powerLine);

    const items: PreparedObstacles["items"] = [];
    const prepared: PreparedObstacles = {
        items,
        dispose: () => {
            for (const item of items.splice(0)) disposeShape(item.solid);
        },
    };
    try {
        for (const fp of buildings) {
            items.push({
                solid: buildBuildingSolid(factory, fp),
                meta: { id: fp.id, label: fp.label, clearanceLimitM: fp.clearanceLimitM },
            });
        }
        if (powerLine) {
            items.push({
                solid: buildPowerLineWall(factory, powerLine),
                meta: {
                    id: powerLine.id,
                    label: powerLine.label,
                    clearanceLimitM: powerLine.clearanceLimitM,
                },
            });
        }
    } catch (error) {
        prepared.dispose();
        throw error;
    }
    return prepared;
}

/**
 * Checks one boom placement against obstacles that were built by `prepareObstacles`.
 * Builds the boom solid, and frees it again before returning (also when a check throws).
 * The obstacles are not freed here.
 */
export function checkPreparedObstacles(
    factory: IShapeFactory,
    placement: BoomPlacement,
    obstacles: PreparedObstacles,
): SiteClearanceReport {
    const boomSolid = buildBoomSolid(factory, placement);
    const results: ObstacleClearanceResult[] = [];
    try {
        for (const item of obstacles.items) {
            results.push(checkOneClearance(boomSolid, item.solid, item.meta, factory));
        }
    } finally {
        disposeShape(boomSolid);
    }

    // Sort: CRITICAL first, then WARNING, then SAFE; within same status, sort by distance ascending.
    const severity = (s: ObstacleClearanceResult["status"]) =>
        s === "CRITICAL" ? 0 : s === "WARNING" ? 1 : 2;
    results.sort((a, b) => {
        const sv = severity(a.status) - severity(b.status);
        return sv !== 0 ? sv : a.minDistanceM - b.minDistanceM;
    });

    const worstCase = results.length > 0 ? results[0] : null;
    const anyCollision = results.some((r) => r.isCollision || r.isTouching);

    return {
        obstacles: results,
        worstCase,
        anyCollision,
        disclaimer: "Planning aid, not a certified lift plan.",
    };
}

/**
 * Computes clearance between a crane boom and all site obstacles.
 *
 * Steps:
 *  1. Validate every obstacle and the boom (before any kernel call).
 *  2. Extrude every building footprint into a solid and build the power-line wall (if given).
 *  3. Build the boom solid from `placement`.
 *  4. Call checkOneClearance for each obstacle.
 *  5. Sort results (most severe first, then closest) and pick the worst case.
 *  6. Free the solids that were built.
 *
 * Throws RangeError if the placement or any obstacle is invalid (checked before any kernel
 * call), and Error if an obstacle cannot be built or measured. There is no partial result.
 *
 * @param factory - ShapeFactory (WASM-backed, initialised via initWasm).
 * @param placement - Boom geometry and crane position.
 * @param buildings - Array of building footprints from the site model.
 * @param powerLine - Optional power-line obstacle.
 * @returns SiteClearanceReport.
 */
export function computeSiteClearance(
    factory: IShapeFactory,
    placement: BoomPlacement,
    buildings: ObstacleFootprint[],
    powerLine?: PowerLineObstacle,
): SiteClearanceReport {
    // Validate every obstacle first, then the boom, so that no kernel work is done for invalid input.
    for (const fp of buildings) validateObstacleFootprint(fp);
    if (powerLine) validatePowerLineObstacle(powerLine);
    validateBoomPlacement(placement);

    const obstacles = prepareObstacles(factory, buildings, powerLine);
    try {
        return checkPreparedObstacles(factory, placement, obstacles);
    } finally {
        obstacles.dispose();
    }
}
