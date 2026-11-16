// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import type { CraneEvaluation, Pick, PickPoint } from "../pickEngine";
import type { SourcedNumber, TowerCrane } from "../types";

/**
 * Basis recorded when the project-selected jib does not exactly match a
 * catalogue default or a published jib row. It is deliberately explicit: a
 * custom length is a project choice, not manufacturer data.
 */
export const CUSTOM_JIB_PROVENANCE_BASIS =
    "Project-selected jib length entered in Tower Pick Check; no catalogue row matched.";

/**
 * The selected-crane values confirmed by the user. This is the raw dialog state
 * before validation, so the mast may be undefined and numeric fields may be
 * non-finite. A draft is never stored directly.
 */
export type PickCheckSessionDraft = {
    readonly crane: TowerCrane;
    readonly jibM: number;
    readonly windKmh: number | null;
    readonly mast: PickPoint | undefined;
    readonly picks: readonly Pick[];
    readonly evaluation: CraneEvaluation;
};

/**
 * A confirmed Pick Check evaluation for one document. It intentionally holds
 * only the selected crane and its selected-crane evaluation; it does not keep
 * the catalogue comparison matrix, placement slew, site geometry or T8/T9 data.
 */
export type PickCheckSession = {
    readonly crane: TowerCrane;
    readonly jibM: SourcedNumber;
    readonly windKmh: number | null;
    readonly mast: PickPoint;
    readonly picks: readonly Pick[];
    readonly evaluation: CraneEvaluation;
};

export type PickCheckCaptureIssue =
    | "no-picks"
    | "invalid-jib"
    | "invalid-mast"
    | "invalid-wind"
    | "invalid-pick"
    | "invalid-evaluation";

const sessions = new WeakMap<IDocument, PickCheckSession>();

function clone<T>(value: T): T {
    return structuredClone(value);
}

function publishedJibRow(crane: TowerCrane, jibM: number): SourcedNumber | undefined {
    // The catalogue default wins when the values coincide: it explains why the
    // field was initially populated, even when the same length also appears in
    // the published rows.
    if (jibM === crane.defaultJibM.value) return crane.defaultJibM;

    const tipLoadRow = crane.tipLoadByJib.find((row) => row.jibM.value === jibM);
    if (tipLoadRow !== undefined) return tipLoadRow.jibM;

    const chartRow = crane.loadChart?.find((row) => row.jibM.value === jibM);
    return chartRow?.jibM;
}

/**
 * Resolve the provenance of the jib currently entered in the dialog. Exact
 * catalogue values keep their own provenance; every other length is an
 * INDICATIVE project configuration. The result is a copy, so callers cannot
 * mutate catalogue data through the session.
 */
export function resolvePickCheckJib(crane: TowerCrane, jibM: number): SourcedNumber {
    const published = publishedJibRow(crane, jibM);
    if (published !== undefined) return clone(published);

    return {
        value: jibM,
        provenance: {
            kind: "indicative",
            basis: CUSTOM_JIB_PROVENANCE_BASIS,
        },
    };
}

/**
 * Check the draft against the capture contract before anything is stored.
 * FAIL, OUT_OF_RANGE and UNSUPPORTED are valid evaluated outcomes; only
 * INVALID or malformed input blocks a capture.
 */
export function validatePickCheckCapture(draft: PickCheckSessionDraft): PickCheckCaptureIssue | undefined {
    if (draft.picks.length === 0) return "no-picks";

    if (!Number.isFinite(draft.jibM)) return "invalid-jib";

    if (draft.mast === undefined || !Number.isFinite(draft.mast.x) || !Number.isFinite(draft.mast.y)) {
        return "invalid-mast";
    }

    if (draft.windKmh !== null && (!Number.isFinite(draft.windKmh) || draft.windKmh < 0)) {
        return "invalid-wind";
    }

    for (const pick of draft.picks) {
        if (
            !Number.isFinite(pick.loadT) ||
            pick.supply === undefined ||
            !Number.isFinite(pick.supply.x) ||
            !Number.isFinite(pick.supply.y) ||
            pick.drop === undefined ||
            !Number.isFinite(pick.drop.x) ||
            !Number.isFinite(pick.drop.y)
        ) {
            return "invalid-pick";
        }
    }

    const evaluation = draft.evaluation;
    if (
        evaluation.craneId !== draft.crane.id ||
        evaluation.jibM !== draft.jibM ||
        evaluation.windKmh !== draft.windKmh ||
        evaluation.picks.length !== draft.picks.length ||
        evaluation.picks.some((pick) => pick.status === "INVALID")
    ) {
        return "invalid-evaluation";
    }

    return undefined;
}

/**
 * Store an explicitly confirmed session for the document. Invalid drafts are
 * rejected rather than replaced by a partial or all-INVALID evaluation.
 */
export function capturePickCheckSession(
    document: IDocument,
    draft: PickCheckSessionDraft,
): PickCheckSession | undefined {
    if (validatePickCheckCapture(draft) !== undefined) return undefined;
    if (draft.mast === undefined) return undefined;

    const session: PickCheckSession = {
        crane: clone(draft.crane),
        jibM: resolvePickCheckJib(draft.crane, draft.jibM),
        windKmh: draft.windKmh,
        mast: clone(draft.mast),
        picks: clone(draft.picks),
        evaluation: clone(draft.evaluation),
    };

    sessions.set(document, session);
    return clone(session);
}

/** Read a copy so callers cannot mutate the stored session. */
export function readPickCheckSession(document: IDocument): PickCheckSession | undefined {
    const session = sessions.get(document);
    return session === undefined ? undefined : clone(session);
}

/** Clear only the addressed document's session. */
export function clearPickCheckSession(document: IDocument): void {
    sessions.delete(document);
}
