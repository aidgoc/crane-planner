// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 / S4 — Active Project Site Model Obstacle Adapter
// Owner: Ajit
// ============================================================================

import { type I18nKeys, type IDocument, PubSub } from "@chili3d/core";
import { hasSiteSource, readSiteSource } from "../../../site-model/src/siteSelection";
import { loadSiteProjectFromDxf } from "../../../site-model/src/siteSource";
import type { SiteProject } from "../../../site-model/src/types";
import type { SiteObstacle } from "./placementState";

/**
 * Standard default clearance distance in metres for buildings when not specified.
 * Rule: INDICATIVE planning clearance.
 */
export const DEFAULT_BUILDING_CLEARANCE_M = 2.0;

/**
 * Adapts a shared `SiteProject` (v1 schema) into an array of 2D `SiteObstacle`s
 * for mobile crane horizontal placement clearance evaluation (M8).
 *
 * Sourced fields:
 * - `buildings`: Extracted as polygonal obstacles (`[[x, y], ...]`) with height and label.
 * - `power_line`: Extracted as an infinite vertical plane hazard line (`xLineM`).
 * - `no_go_zones`: Extracted as point/radius obstacles (`xM`, `yM`, `radius_m`).
 */
export function adaptSiteProjectToObstacles(project: SiteProject): SiteObstacle[] {
    const obstacles: SiteObstacle[] = [];

    // 1. Buildings
    if (project.buildings) {
        for (const [id, building] of Object.entries(project.buildings)) {
            if (building && Array.isArray(building.polygon) && building.polygon.length >= 3) {
                const poly: [number, number][] = building.polygon.map((pt) => [pt.x, pt.y]);
                const label = building.label || `${id} (${building.height_m} m)`;
                obstacles.push({
                    label,
                    polygon: poly,
                    heightM: building.height_m,
                    requiredClearanceM: DEFAULT_BUILDING_CLEARANCE_M,
                });
            }
        }
    }

    // 2. Power Line Hazard
    if (project.power_line && Number.isFinite(project.power_line.x_m)) {
        const voltage = project.power_line.voltage_kv ?? 22;
        const x = project.power_line.x_m;
        const clearance = project.power_line.clearance_m ?? 6.0;
        obstacles.push({
            label: `${voltage} kV Power Line (x = ${x} m)`,
            xLineM: x,
            requiredClearanceM: clearance,
        });
    }

    // 3. No-Go Exclusion Zones
    if (Array.isArray(project.no_go_zones)) {
        for (const zone of project.no_go_zones) {
            if (
                zone?.center &&
                Number.isFinite(zone.center.x) &&
                Number.isFinite(zone.center.y) &&
                Number.isFinite(zone.radius_m)
            ) {
                obstacles.push({
                    label: zone.label || `No-Go Zone ${zone.id} (${zone.radius_m} m)`,
                    xM: zone.center.x,
                    yM: zone.center.y,
                    requiredClearanceM: zone.radius_m,
                });
            }
        }
    }

    return obstacles;
}

export interface LoadedPlacementObstacles {
    readonly siteName: string;
    readonly obstacles: readonly SiteObstacle[];
}

/**
 * Resolves the site obstacles from the active project's (document) selected site.
 * Follows the exact pattern established by Tower Planner (PR #15):
 * - If no site is selected against the document, toasts `mobile.crane.site.noActiveSite` and returns undefined.
 * - If the stored DXF cannot be read or parsed, toasts `mobile.crane.site.unavailable` and returns undefined.
 * - Otherwise, parses the DXF text into a `SiteProject` and adapts it to `SiteObstacle[]`.
 *
 * There is NO silent fallback to fabricated/hard-coded site data.
 */
export function loadPlacementObstacles(document: IDocument): LoadedPlacementObstacles | undefined {
    if (!hasSiteSource(document)) {
        PubSub.default.pub("showToast", "mobile.crane.site.noActiveSite" as I18nKeys, document.name);
        return undefined;
    }

    const source = readSiteSource(document);
    if (!source.isOk) {
        PubSub.default.pub("showToast", "mobile.crane.site.unavailable" as I18nKeys, source.error);
        return undefined;
    }

    const project = loadSiteProjectFromDxf(source.value.dxfText);
    if (!project.isOk) {
        PubSub.default.pub("showToast", "mobile.crane.site.unavailable" as I18nKeys, project.error);
        return undefined;
    }

    return {
        siteName: source.value.name,
        obstacles: adaptSiteProjectToObstacles(project.value),
    };
}
