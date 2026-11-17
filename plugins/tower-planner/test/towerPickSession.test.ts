// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { JASO_TD, MCT85F5, MCT88 } from "../src/catalogue";
import { evaluateCrane, type Pick } from "../src/pickEngine";
import {
    CUSTOM_JIB_PROVENANCE_BASIS,
    capturePickCheckSession,
    clearPickCheckSession,
    type PickCheckSessionDraft,
    readPickCheckSession,
    validatePickCheckCapture,
} from "../src/report/towerPickSession";

/*
 * HAND-WORKED SANITY CHECK (fixture values, not catalogue data):
 *
 * P1 uses 2 t at a governing radius of hypot(20, 20) = 28.28 m.
 * P2 uses 1.5 t at a governing radius of hypot(-10, -20) = 22.36 m.
 * Both are comfortably inside the MCT 88's 52 m published jib range, so the
 * selected-crane evaluation has no INVALID pick. The session tests do not
 * recalculate capacity; they only exercise capture, provenance and copying.
 */
const PICKS: readonly Pick[] = [
    { label: "P1", loadT: 2, supply: { x: 10, y: 10 }, drop: { x: 20, y: 20 } },
    { label: "P2", loadT: 1.5, supply: { x: -10, y: 0 }, drop: { x: 0, y: -20 } },
];

function makeDraft(overrides: Partial<PickCheckSessionDraft> = {}): PickCheckSessionDraft {
    const base = {
        crane: MCT88,
        jibM: 30,
        windKmh: 12 as number | null,
        mast: { x: 0, y: 0 },
        picks: PICKS,
    };
    const merged = { ...base, ...overrides };
    return {
        ...merged,
        evaluation:
            overrides.evaluation ??
            evaluateCrane(merged.crane, merged.picks, {
                jibM: merged.jibM,
                windKmh: merged.windKmh,
                mast: merged.mast,
            }),
    };
}

function requireSession(document: TestDocument) {
    const session = readPickCheckSession(document);
    if (session === undefined) throw new Error("Expected a captured Pick Check session.");
    return session;
}

describe("tower Pick Check session", () => {
    test("captures the selected crane, jib, inputs and selected-crane evaluation", () => {
        const document = new TestDocument();
        const draft = makeDraft({ windKmh: 18 });

        const stored = capturePickCheckSession(document, draft);
        expect(stored).not.toBeUndefined();

        const session = requireSession(document);
        expect(session.crane.id).toBe(MCT88.id);
        expect(session.crane.sources).toEqual(MCT88.sources);
        expect(session.jibM).toEqual(MCT88.defaultJibM);
        expect(session.windKmh).toBe(18);
        expect(session.mast).toEqual({ x: 0, y: 0 });
        expect(session.picks).toEqual(PICKS);
        expect(session.evaluation).toEqual(draft.evaluation);
        expect(session.evaluation.craneId).toBe(MCT88.id);
        expect(session.evaluation.jibM).toBe(30);
        expect(session.evaluation.picks).toHaveLength(PICKS.length);

        // Only the selected-crane result is stored: no placement, slew, site,
        // height/T8/T9 parameters or catalogue-wide matrix.
        expect(session).not.toHaveProperty("placement");
        expect(session).not.toHaveProperty("slewAngleDeg");
        expect(session).not.toHaveProperty("site");
        expect(session).not.toHaveProperty("heightParameters");
        expect(session).not.toHaveProperty("matrix");
    });

    test("isolates sessions by document and clears only the addressed document", () => {
        const first = new TestDocument();
        const second = new TestDocument();

        capturePickCheckSession(first, makeDraft({ jibM: 35 }));
        expect(readPickCheckSession(first)?.jibM.value).toBe(35);
        expect(readPickCheckSession(second)).toBeUndefined();

        capturePickCheckSession(second, makeDraft({ crane: MCT85F5, jibM: 40 }));
        expect(readPickCheckSession(first)?.jibM.value).toBe(35);
        expect(readPickCheckSession(second)?.jibM.value).toBe(40);

        clearPickCheckSession(first);
        expect(readPickCheckSession(first)).toBeUndefined();
        expect(readPickCheckSession(second)?.jibM.value).toBe(40);
    });

    test("copies the draft and every read so later mutations cannot change the session", () => {
        const document = new TestDocument();
        const crane = structuredClone(MCT88);
        const originalName = crane.name;
        const picks: Pick[] = PICKS.map((pick) => ({
            ...pick,
            supply: pick.supply === undefined ? undefined : { ...pick.supply },
            drop: pick.drop === undefined ? undefined : { ...pick.drop },
        }));
        const draft = makeDraft({ crane, picks });
        const stored = capturePickCheckSession(document, draft);
        expect(stored).not.toBeUndefined();
        if (draft.mast === undefined) throw new Error("The test draft needs a mast.");

        // Mutating the objects handed to capture must not reach the store.
        picks[0].loadT = 99;
        if (picks[0].supply !== undefined) picks[0].supply.x = -999;
        draft.mast.x = 50;
        draft.evaluation.picks[0].status = "INVALID";
        draft.crane.name = "mutated crane";

        const firstRead = requireSession(document);
        expect(firstRead.picks[0].loadT).toBe(2);
        expect(firstRead.mast).toEqual({ x: 0, y: 0 });
        expect(firstRead.evaluation.picks[0].status).not.toBe("INVALID");
        expect(firstRead.crane.name).toBe(originalName);

        // Mutating a read result must not reach the store either.
        firstRead.picks[0].loadT = 123;
        firstRead.mast.x = 77;
        firstRead.jibM.value = 88;
        firstRead.evaluation.picks[0].status = "INVALID";
        firstRead.crane.name = "mutated read";

        const secondRead = requireSession(document);
        expect(secondRead.picks[0].loadT).toBe(2);
        expect(secondRead.mast).toEqual({ x: 0, y: 0 });
        expect(secondRead.jibM.value).toBe(30);
        expect(secondRead.evaluation.picks[0].status).not.toBe("INVALID");
        expect(secondRead.crane.name).toBe(originalName);
    });

    test("keeps catalogue default provenance for the exact default jib", () => {
        const document = new TestDocument();
        capturePickCheckSession(document, makeDraft({ jibM: MCT88.defaultJibM.value }));

        const session = requireSession(document);
        expect(session.jibM.value).toBe(MCT88.defaultJibM.value);
        expect(session.jibM.provenance).toEqual(MCT88.defaultJibM.provenance);
    });

    test("keeps the published row provenance for an exact published jib", () => {
        const document = new TestDocument();
        const published = MCT88.tipLoadByJib.find((row) => row.jibM.value === 35);
        expect(published).not.toBeUndefined();

        capturePickCheckSession(document, makeDraft({ jibM: 35 }));

        const session = requireSession(document);
        expect(session.jibM).toEqual(published?.jibM);
        expect(session.jibM.provenance).toEqual({
            kind: "source",
            sourceId: "datasheetOverview",
        });
    });

    test("falls back to a published chart row when no tip-load row matches", () => {
        const document = new TestDocument();
        const chartOnlyCrane = structuredClone(MCT88);
        chartOnlyCrane.tipLoadByJib = MCT88.tipLoadByJib.filter((row) => row.jibM.value !== 35);
        const published = chartOnlyCrane.loadChart?.find((row) => row.jibM.value === 35);
        expect(published).not.toBeUndefined();

        capturePickCheckSession(document, makeDraft({ crane: chartOnlyCrane, jibM: 35 }));

        const session = requireSession(document);
        expect(session.jibM).toEqual(published?.jibM);
        expect(session.jibM.provenance).toEqual({
            kind: "source",
            sourceId: "datasheetLoadCharts",
        });
    });

    test("records INDICATIVE provenance for a custom jib length", () => {
        const document = new TestDocument();
        // A chart crane rejects an unpublished jib as INVALID before capture.
        // Removing the chart leaves the tip-load idealisation, which can
        // evaluate a length between its published rows.
        const tipLoadCrane = structuredClone(MCT88);
        delete tipLoadCrane.loadChart;

        capturePickCheckSession(document, makeDraft({ crane: tipLoadCrane, jibM: 31 }));

        const session = requireSession(document);
        expect(session.jibM).toEqual({
            value: 31,
            provenance: {
                kind: "indicative",
                basis: CUSTOM_JIB_PROVENANCE_BASIS,
            },
        });
        expect(session.jibM.provenance).not.toEqual(MCT88.defaultJibM.provenance);
    });

    test("rejects an all-INVALID evaluation instead of storing it", () => {
        const document = new TestDocument();
        const noMast = makeDraft({ mast: undefined });
        expect(noMast.evaluation.picks.map((pick) => pick.status)).toEqual(["INVALID", "INVALID"]);

        expect(capturePickCheckSession(document, noMast)).toBeUndefined();
        expect(readPickCheckSession(document)).toBeUndefined();
    });

    test("permits FAIL and OUT_OF_RANGE picks as legitimate evaluated outcomes", () => {
        const document = new TestDocument();
        const picks: Pick[] = [
            { label: "overload", loadT: 100, supply: { x: 10, y: 0 }, drop: { x: 20, y: 0 } },
            { label: "far", loadT: 1, supply: { x: 0, y: 0 }, drop: { x: 100, y: 0 } },
        ];
        const draft = makeDraft({ picks });
        expect(draft.evaluation.picks.map((pick) => pick.status)).toEqual(["FAIL", "OUT_OF_RANGE"]);

        expect(capturePickCheckSession(document, draft)).not.toBeUndefined();
        expect(requireSession(document).evaluation.picks.map((pick) => pick.status)).toEqual([
            "FAIL",
            "OUT_OF_RANGE",
        ]);
    });

    test("permits an UNSUPPORTED luffing-jib evaluation", () => {
        const document = new TestDocument();
        const draft = makeDraft({ crane: JASO_TD, jibM: JASO_TD.defaultJibM.value });
        expect(draft.evaluation.unsupported).toBe(true);
        expect(draft.evaluation.picks.every((pick) => pick.status === "UNSUPPORTED")).toBe(true);

        expect(capturePickCheckSession(document, draft)).not.toBeUndefined();
        expect(requireSession(document).evaluation.craneId).toBe(JASO_TD.id);
        expect(requireSession(document).evaluation.unsupported).toBe(true);
    });

    test.each([
        ["no picks", () => makeDraft({ picks: [] }), "no-picks"],
        ["a non-finite jib", () => makeDraft({ jibM: Number.NaN }), "invalid-jib"],
        ["a missing mast", () => makeDraft({ mast: undefined }), "invalid-mast"],
        ["a non-finite mast", () => makeDraft({ mast: { x: 0, y: Number.NaN } }), "invalid-mast"],
        ["negative wind", () => makeDraft({ windKmh: -1 }), "invalid-wind"],
        ["non-finite wind", () => makeDraft({ windKmh: Number.NaN }), "invalid-wind"],
        [
            "a non-finite pick load",
            () => makeDraft({ picks: [{ ...PICKS[0], loadT: Number.NaN } as Pick] }),
            "invalid-pick",
        ],
        [
            "a missing supply point",
            () => makeDraft({ picks: [{ label: "P1", loadT: 2, drop: { x: 20, y: 20 } }] }),
            "invalid-pick",
        ],
        [
            "a non-finite drop coordinate",
            () =>
                makeDraft({
                    picks: [
                        {
                            label: "P1",
                            loadT: 2,
                            supply: { x: 10, y: 10 },
                            drop: { x: Number.NaN, y: 20 },
                        },
                    ],
                }),
            "invalid-pick",
        ],
    ] as const)("rejects %s", (_label, makeInvalidDraft, issue) => {
        const document = new TestDocument();
        const draft = makeInvalidDraft();
        expect(validatePickCheckCapture(draft)).toBe(issue);
        expect(capturePickCheckSession(document, draft)).toBeUndefined();
        expect(readPickCheckSession(document)).toBeUndefined();
    });

    test("does not let a different crane's matrix evaluation stand in for the selected crane", () => {
        const document = new TestDocument();
        const otherCraneEvaluation = evaluateCrane(MCT85F5, PICKS, {
            jibM: 30,
            windKmh: 12,
            mast: { x: 0, y: 0 },
        });

        const stored = capturePickCheckSession(document, makeDraft({ evaluation: otherCraneEvaluation }));
        expect(stored).toBeUndefined();
        expect(readPickCheckSession(document)).toBeUndefined();
    });
});
