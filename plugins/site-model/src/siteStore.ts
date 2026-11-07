// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// S1/S4 — Active Site Project State Store
// Owner: Ajit
// ============================================================================

import { SAMPLE_SITE_PROJECT } from "./sampleSiteData";
import type { SiteProject } from "./types";

let currentSiteProject: SiteProject | undefined;

/**
 * Gets the currently loaded SiteProject instance.
 * Defaults to the synthetic sample site if none has been explicitly set.
 */
export function getActiveSiteProject(): SiteProject {
    if (!currentSiteProject) {
        currentSiteProject = SAMPLE_SITE_PROJECT;
    }
    return currentSiteProject;
}

/**
 * Sets the active SiteProject (e.g. after importing DXF or loading JSON).
 */
export function setActiveSiteProject(project: SiteProject): void {
    currentSiteProject = project;
}

/**
 * Resets the active project back to undefined (for testing/cleanup).
 */
export function resetActiveSiteProject(): void {
    currentSiteProject = undefined;
}
