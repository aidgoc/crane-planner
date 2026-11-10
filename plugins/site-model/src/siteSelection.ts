// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IDocument, Result } from "@chili3d/core";

/**
 * Where a document keeps its selected shared site model inside `IDocument.userData`.
 * This follows the per-document storage pattern the AI package uses for chat history
 * (packages/ai/src/history.ts): one namespaced key, written when a site is selected,
 * serialized with the document on save, and gone when the document is deleted — no
 * separate store to keep in step.
 */
export const SITE_SOURCE_USER_DATA_KEY = "siteSource";

/**
 * A site model selected for a project (document). Only the raw DXF text is stored;
 * every consumer re-parses it through `loadSiteProjectFromDxf` on demand, so the
 * stored bytes are never trusted blindly.
 */
export interface SiteSourceSelection {
    readonly kind: "dxfText";
    /** File name shown in toasts and reports; not used for parsing. */
    readonly name: string;
    /** Raw DXF text of the selected site plan. */
    readonly dxfText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function validateSelection(value: unknown): Result<SiteSourceSelection, string> {
    if (!isRecord(value)) {
        return Result.err(`Stored site selection is invalid (${typeof value}).`);
    }
    if (value["kind"] !== "dxfText") {
        return Result.err(`Unsupported site selection kind '${String(value["kind"])}'.`);
    }
    const name = value["name"];
    if (typeof name !== "string" || !name.trim()) {
        return Result.err("Stored site selection is missing its name.");
    }
    const dxfText = value["dxfText"];
    if (typeof dxfText !== "string" || !dxfText.trim()) {
        return Result.err("Stored site selection has no DXF text.");
    }
    return Result.ok({ kind: "dxfText", name, dxfText });
}

/**
 * Whether a site selection is stored against the project, regardless of whether the
 * stored value is still valid. Distinguishes "nothing was ever imported" from
 * "the stored selection is malformed".
 */
export function hasSiteSource(document: IDocument): boolean {
    return document.userData?.[SITE_SOURCE_USER_DATA_KEY] !== undefined;
}

/**
 * Read the project's selected site source. The stored value is validated defensively
 * on every read: missing or malformed data is reported as an error, never turned into
 * fabricated site data.
 */
export function readSiteSource(document: IDocument): Result<SiteSourceSelection, string> {
    const stored = document.userData?.[SITE_SOURCE_USER_DATA_KEY];
    if (stored === undefined) {
        return Result.err("No site model is selected in this project.");
    }
    return validateSelection(stored);
}

/**
 * Select the site model for a project. The selection is validated before anything is
 * written, so malformed data never reaches `userData`; on failure the previously
 * selected site is left untouched.
 */
export function writeSiteSource(document: IDocument, selection: SiteSourceSelection): Result<void, string> {
    const validated = validateSelection(selection);
    if (!validated.isOk) return Result.err(validated.error);

    document.userData ??= {};
    document.userData[SITE_SOURCE_USER_DATA_KEY] = validated.value;
    return Result.ok(undefined);
}

/**
 * Remove the project's site selection. Tower Planner then reports UNAVAILABLE
 * instead of using any previous site.
 */
export function clearSiteSource(document: IDocument): void {
    delete document.userData?.[SITE_SOURCE_USER_DATA_KEY];
}
