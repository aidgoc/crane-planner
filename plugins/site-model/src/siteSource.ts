// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Result } from "@chili3d/core";
import { type ParseDxfOptions, parseDxfToSite } from "./dxfParser";
import { validateSiteProject } from "./schema";
import type { SiteProject } from "./types";

/** Shared sample site used by both planners until a project file picker is added. */
export const SITE_MODEL_DXF_URL = "sample-site/sample-site.dxf";

/**
 * Parse a site DXF through the site-model schema. The parser never synthesises
 * a boundary; malformed or open geometry is returned as an error.
 */
export function loadSiteProjectFromDxf(
    dxfText: string,
    options?: ParseDxfOptions,
): Result<SiteProject, string> {
    if (typeof dxfText !== "string" || !dxfText.trim()) {
        return Result.err("Site model DXF is empty.");
    }

    try {
        const project = parseDxfToSite(dxfText, options);
        return validateSiteProject(project);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Result.err(`DXF parse error: ${message}`);
    }
}

/**
 * Load the shared site project from a URL. This is the production data path
 * used by the Tower Planner; callers must handle the error result instead of
 * substituting invented site geometry.
 */
export async function loadSiteProjectFromUrl(
    url: string = SITE_MODEL_DXF_URL,
    options?: ParseDxfOptions,
): Promise<Result<SiteProject, string>> {
    let response: Response;
    try {
        response = await fetch(url);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Result.err(`Could not fetch site model from '${url}': ${message}`);
    }

    if (!response.ok) {
        return Result.err(`Could not fetch site model from '${url}': HTTP ${response.status}.`);
    }

    let dxfText: string;
    try {
        dxfText = await response.text();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Result.err(`Could not read site model from '${url}': ${message}`);
    }

    return loadSiteProjectFromDxf(dxfText, options);
}
