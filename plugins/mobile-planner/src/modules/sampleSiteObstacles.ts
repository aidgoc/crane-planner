// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// DGOC Sample Site Obstacles for Mobile Crane Clearance Checking
// Sources: public/sample-site/sample-site.json & public/sample-site/README.md
// ============================================================================

import type { SiteObstacle } from "./placementState";

/**
 * Standard obstacles from the DGOC synthetic sample site.
 * All footprints and hazard lines sourced from public/sample-site/sample-site.json.
 * Clearances are INDICATIVE sample planning values (must be confirmed with site/authority).
 */
export const SAMPLE_SITE_OBSTACLES: readonly SiteObstacle[] = Object.freeze([
    {
        label: "Tower A (G+24, 75 m)",
        polygon: [
            [25, 20],
            [65, 20],
            [65, 42],
            [25, 42],
        ],
        heightM: 75.0,
        requiredClearanceM: 2.0, // INDICATIVE planning clearance
    },
    {
        label: "Tower B (G+14, 45 m)",
        polygon: [
            [50, 54],
            [70, 54],
            [70, 68],
            [50, 68],
        ],
        heightM: 45.0,
        requiredClearanceM: 2.0, // INDICATIVE planning clearance
    },
    {
        label: "Podium (9 m)",
        polygon: [
            [15, 12],
            [75, 12],
            [75, 50],
            [15, 50],
        ],
        heightM: 9.0,
        requiredClearanceM: 2.0, // INDICATIVE planning clearance
    },
    {
        label: "Site Office (3 m)",
        polygon: [
            [76, 56],
            [86, 56],
            [86, 66],
            [76, 66],
        ],
        heightM: 3.0,
        requiredClearanceM: 2.0, // INDICATIVE planning clearance
    },
    {
        label: "Neighbour East (30 m)",
        polygon: [
            [96, 8],
            [122, 8],
            [122, 42],
            [96, 42],
        ],
        heightM: 30.0,
        requiredClearanceM: 2.0, // INDICATIVE planning clearance
    },
    {
        label: "Neighbour North (12 m)",
        polygon: [
            [8, 78],
            [52, 78],
            [52, 96],
            [8, 96],
        ],
        heightM: 12.0,
        requiredClearanceM: 2.0, // INDICATIVE planning clearance
    },
    {
        label: "22 kV Power Line (x = -9 m)",
        xLineM: -9.0,
        requiredClearanceM: 6.0, // INDICATIVE UK HSE GS6 recommendation (public/sample-site/sample-site.json)
    },
]);
