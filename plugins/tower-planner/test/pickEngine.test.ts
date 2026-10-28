// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { MCT85F5, MCT88 } from "../src/catalogue";
import { evaluateCrane, evaluatePick, findCranesPassingAllPicks, type Pick } from "../src/pickEngine";
import type { CapacityModel, SourcedNumber } from "../src/types";

// Worked by hand for the MCT 88 with a 30 m jib:
//   M = 2.70 t × 30 m = 81 t·m; corner = 81 / 5 = 16.2 m.
//   2.5 t @ 20 m -> 81 / 20 = 4.05 t -> 2.5 / 4.05 = 61.7 %, PASS
//   3.0 t @ 25 m -> 81 / 25 = 3.24 t -> 3.0 / 3.24 = 92.6 %, PASS
//   4.0 t @ 30 m -> 81 / 30 = 2.70 t -> 4.0 / 2.70 = 148.1 %, FAIL
const SAMPLE_PICKS: readonly Pick[] = [
    { label: "1", loadT: 2.5, radiusM: 20 },
    { label: "2", loadT: 3.0, radiusM: 25 },
    { label: "3", loadT: 4.0, radiusM: 30 },
];

function indicative(value: number): SourcedNumber {
    return {
        value,
        provenance: {
            kind: "indicative",
            basis: "Synthetic test fixture, not a real crane.",
        },
    };
}

/** Clearly synthetic: max 2 t, 20 m jib, 0.75 t tip load. Not a real machine. */
const SYNTHETIC_MINI: CapacityModel = {
    id: "synthetic-mini",
    name: "Synthetic Mini (test only)",
    maxCapacityT: indicative(2),
    defaultJibM: indicative(20),
    tipLoadByJib: [
        { jibM: indicative(10), tipT: indicative(1.5) },
        { jibM: indicative(20), tipT: indicative(0.75) },
    ],
};

/** Clearly synthetic: max 5 t, 30 m jib, 4 t at 20 m and 3 t at 30 m. */
const SYNTHETIC_WIDE: CapacityModel = {
    id: "synthetic-wide",
    name: "Synthetic Wide (test only)",
    maxCapacityT: indicative(5),
    defaultJibM: indicative(30),
    tipLoadByJib: [
        { jibM: indicative(20), tipT: indicative(4) },
        { jibM: indicative(30), tipT: indicative(3) },
    ],
};

/** Clearly synthetic: no published jib rows, so no jib range can be derived. */
const SYNTHETIC_EMPTY: CapacityModel = {
    id: "synthetic-empty",
    name: "Synthetic Empty (test only)",
    maxCapacityT: indicative(5),
    defaultJibM: indicative(20),
    tipLoadByJib: [],
};

describe("evaluatePick", () => {
    test("evaluates the three sample picks with capacity, utilisation and PASS/FAIL", () => {
        const evaluation = evaluateCrane(MCT88, SAMPLE_PICKS);

        expect(evaluation.picks.map((pick) => pick.status)).toEqual(["PASS", "PASS", "FAIL"]);

        const [first, second, third] = evaluation.picks;
        expect(first.capacityT).toBeCloseTo(4.05, 10);
        expect(second.capacityT).toBeCloseTo(3.24, 10);
        expect(third.capacityT).toBeCloseTo(2.7, 10);
        expect(first.utilisationPct).toBeCloseTo(61.728, 3);
        expect(second.utilisationPct).toBeCloseTo(92.593, 3);
        expect(third.utilisationPct).toBeCloseTo(148.148, 3);

        expect(evaluation.allPass).toBe(false);
        expect(evaluation.failedCount).toBe(1);
    });

    test("fails the backlog acceptance case: 4 t at 30 m on the 30 m jib", () => {
        const result = evaluatePick(MCT88, { loadT: 4, radiusM: 30 }, { jibM: 30 });

        expect(result.capacityT).toBeCloseTo(2.7, 10);
        expect(result.utilisationPct).toBeCloseTo(148.148, 3);
        expect(result.status).toBe("FAIL");
    });

    test("uses the catalogue default jib when no jib is supplied", () => {
        const result = evaluatePick(MCT88, { loadT: 4, radiusM: 30 });

        expect(result.jibM).toBe(30);
        expect(result.status).toBe("FAIL");
    });

    test("passes when every load is inside capacity", () => {
        const evaluation = evaluateCrane(MCT88, SAMPLE_PICKS.slice(0, 2));

        expect(evaluation.picks.map((pick) => pick.status)).toEqual(["PASS", "PASS"]);
        expect(evaluation.allPass).toBe(true);
        expect(evaluation.failedCount).toBe(0);
    });

    test("treats an empty pick list as not all-pass", () => {
        const evaluation = evaluateCrane(MCT88, []);

        expect(evaluation.picks).toEqual([]);
        expect(evaluation.allPass).toBe(false);
        expect(evaluation.failedCount).toBe(0);
        expect(evaluation.jibM).toBe(30);
        expect(evaluation.windKmh).toBeNull();
    });

    test("returns OUT_OF_RANGE with no capacity or utilisation beyond the jib", () => {
        const result = evaluatePick(MCT88, { loadT: 1, radiusM: 30.1 }, { jibM: 30 });

        expect(result.status).toBe("OUT_OF_RANGE");
        expect(result.capacityT).toBeNull();
        expect(result.utilisationPct).toBeNull();
        expect(result.issue).toBeUndefined();
    });

    test.each([
        { name: "zero load", pick: { loadT: 0, radiusM: 20 }, issue: "invalid-load" },
        { name: "negative load", pick: { loadT: -1, radiusM: 20 }, issue: "invalid-load" },
        { name: "NaN load", pick: { loadT: Number.NaN, radiusM: 20 }, issue: "invalid-load" },
        {
            name: "infinite load",
            pick: { loadT: Number.POSITIVE_INFINITY, radiusM: 20 },
            issue: "invalid-load",
        },
        { name: "zero radius", pick: { loadT: 1, radiusM: 0 }, issue: "invalid-radius" },
        { name: "negative radius", pick: { loadT: 1, radiusM: -1 }, issue: "invalid-radius" },
        { name: "NaN radius", pick: { loadT: 1, radiusM: Number.NaN }, issue: "invalid-radius" },
        {
            name: "infinite radius",
            pick: { loadT: 1, radiusM: Number.POSITIVE_INFINITY },
            issue: "invalid-radius",
        },
    ])("marks $name as INVALID", ({ pick, issue }) => {
        const result = evaluatePick(MCT88, pick, { jibM: 30 });

        expect(result.status).toBe("INVALID");
        expect(result.issue).toBe(issue);
        expect(result.capacityT).toBeNull();
        expect(result.utilisationPct).toBeNull();
    });

    test.each([
        { name: "below the published table", jibM: 10 },
        { name: "above the published table", jibM: 60 },
        { name: "zero", jibM: 0 },
        { name: "negative", jibM: -30 },
        { name: "NaN", jibM: Number.NaN },
        { name: "infinite", jibM: Number.POSITIVE_INFINITY },
    ])("marks a jib $name as INVALID", ({ jibM }) => {
        const result = evaluatePick(MCT88, { loadT: 1, radiusM: 20 }, { jibM });

        expect(result.status).toBe("INVALID");
        expect(result.issue).toBe("jib-outside-published-range");
    });

    test("marks a crane with no published jib rows as INVALID", () => {
        const result = evaluatePick(SYNTHETIC_EMPTY, { loadT: 1, radiusM: 10 });

        expect(result.status).toBe("INVALID");
        expect(result.issue).toBe("jib-outside-published-range");
    });

    test("uses the SIMULATED wind derate in the utilisation check", () => {
        // No wind: 2.3 / 2.70 = 85.2 %, PASS.
        const calm = evaluatePick(MCT88, { loadT: 2.3, radiusM: 30 }, { jibM: 30 });
        expect(calm.status).toBe("PASS");
        expect(calm.utilisationPct).toBeCloseTo(85.185, 3);

        // Wind 20 km/h: 2.70 × 0.8 = 2.16 t; 2.3 / 2.16 = 106.5 %, FAIL.
        const windy = evaluatePick(MCT88, { loadT: 2.3, radiusM: 30 }, { jibM: 30, windKmh: 20 });
        expect(windy.capacityT).toBeCloseTo(2.16, 10);
        expect(windy.status).toBe("FAIL");
        expect(windy.utilisationPct).toBeCloseTo(106.481, 3);
    });

    test("lets a per-pick wind value override the crane-level value", () => {
        const windyPick = evaluatePick(
            MCT88,
            { loadT: 2.3, radiusM: 30, windKmh: 20 },
            { jibM: 30, windKmh: null },
        );
        const calmPick = evaluatePick(
            MCT88,
            { loadT: 2.3, radiusM: 30, windKmh: null },
            { jibM: 30, windKmh: 20 },
        );

        expect(windyPick.capacityT).toBeCloseTo(2.16, 10);
        expect(calmPick.capacityT).toBeCloseTo(2.7, 10);
    });

    test("falls back to the crane-level wind when the pick wind is undefined", () => {
        const result = evaluatePick(
            MCT88,
            { loadT: 2.3, radiusM: 30, windKmh: undefined },
            { jibM: 30, windKmh: 20 },
        );

        expect(result.capacityT).toBeCloseTo(2.16, 10);
        expect(result.status).toBe("FAIL");
    });

    test("does not derate at 0 km/h", () => {
        const result = evaluatePick(MCT88, { loadT: 2.7, radiusM: 30 }, { jibM: 30, windKmh: 0 });

        expect(result.capacityT).toBeCloseTo(2.7, 10);
        expect(result.status).toBe("PASS");
    });

    test.each([
        { name: "negative", windKmh: -1 },
        { name: "NaN", windKmh: Number.NaN },
        { name: "positive infinity", windKmh: Number.POSITIVE_INFINITY },
        { name: "negative infinity", windKmh: Number.NEGATIVE_INFINITY },
    ])("marks $name wind as INVALID with a clear issue", ({ windKmh }) => {
        const result = evaluatePick(MCT88, { loadT: 2.3, radiusM: 30 }, { jibM: 30, windKmh });

        expect(result.status).toBe("INVALID");
        expect(result.issue).toBe("invalid-wind");
        expect(result.capacityT).toBeNull();
        expect(result.utilisationPct).toBeNull();
        expect(result.windKmh).toBe(windKmh);
    });

    test("applies the wind factor exactly once at and above 20 km/h", () => {
        // 2.70 t × 0.8 = 2.16 t, not 2.70 × 0.8 × 0.8 = 1.728 t.
        const atThreshold = evaluatePick(MCT88, { loadT: 2.0, radiusM: 30 }, { jibM: 30, windKmh: 20 });
        const aboveThreshold = evaluatePick(MCT88, { loadT: 2.0, radiusM: 30 }, { jibM: 30, windKmh: 100 });

        expect(atThreshold.capacityT).toBeCloseTo(2.16, 10);
        expect(aboveThreshold.capacityT).toBeCloseTo(2.16, 10);
        expect(aboveThreshold.status).toBe("PASS");
    });

    test("lets a per-pick null wind disable an invalid crane-level wind", () => {
        const result = evaluatePick(
            MCT88,
            { loadT: 2.3, radiusM: 30, windKmh: null },
            { jibM: 30, windKmh: -5 },
        );

        expect(result.status).toBe("PASS");
        expect(result.capacityT).toBeCloseTo(2.7, 10);
        expect(result.windKmh).toBeNull();
    });
});

describe("MCT 85 F5 pick evaluation", () => {
    // Worked by hand from the published p. 3 chart for the 30 m jib:
    //   2.5 t @ 20 m -> 3.9 t  -> 2.5 / 3.9  = 64.103 %, PASS
    //   3.0 t @ 25 m -> 3.0 t  -> 3.0 / 3.0  = 100 %,    PASS
    //   4.0 t @ 30 m -> 2.5 t  -> 4.0 / 2.5  = 160 %,    FAIL
    const MCT85_SAMPLE_PICKS: readonly Pick[] = [
        { label: "1", loadT: 2.5, radiusM: 20 },
        { label: "2", loadT: 3.0, radiusM: 25 },
        { label: "3", loadT: 4.0, radiusM: 30 },
    ];

    test("evaluates picks against the published chart, not the MCT 88 curve", () => {
        const evaluation = evaluateCrane(MCT85F5, MCT85_SAMPLE_PICKS);

        expect(evaluation.picks.map((pick) => pick.status)).toEqual(["PASS", "PASS", "FAIL"]);

        const [first, second, third] = evaluation.picks;
        expect(first.capacityT).toBeCloseTo(3.9, 10);
        expect(second.capacityT).toBeCloseTo(3.0, 10);
        expect(third.capacityT).toBeCloseTo(2.5, 10);
        expect(first.utilisationPct).toBeCloseTo(64.103, 3);
        expect(second.utilisationPct).toBeCloseTo(100, 10);
        expect(third.utilisationPct).toBeCloseTo(160, 10);
        expect(evaluation.allPass).toBe(false);
        expect(evaluation.failedCount).toBe(1);
    });

    test("uses the MCT 85 F5 catalogue default jib when none is supplied", () => {
        const result = evaluatePick(MCT85F5, { loadT: 2.5, radiusM: 30 });

        expect(result.jibM).toBe(30);
        expect(result.capacityT).toBeCloseTo(2.5, 10);
        expect(result.status).toBe("PASS");
    });

    test.each([10, 22, 32.5, 53.1])("marks the unpublished MCT 85 F5 jib %s m as INVALID", (jibM) => {
        const result = evaluatePick(MCT85F5, { loadT: 1, radiusM: 20 }, { jibM });

        expect(result.status).toBe("INVALID");
        expect(result.issue).toBe("jib-outside-published-range");
        expect(result.capacityT).toBeNull();
    });

    test("accepts the published 52 m jib configuration", () => {
        // 1.1 t tip capacity at 52 m; 1.0 / 1.1 = 90.909 %.
        const result = evaluatePick(MCT85F5, { loadT: 1.0, radiusM: 52 }, { jibM: 52 });

        expect(result.status).toBe("PASS");
        expect(result.capacityT).toBeCloseTo(1.1, 10);
        expect(result.utilisationPct).toBeCloseTo(90.909, 3);
    });

    test("returns OUT_OF_RANGE beyond the installed jib", () => {
        const result = evaluatePick(MCT85F5, { loadT: 1, radiusM: 30.1 }, { jibM: 30 });

        expect(result.status).toBe("OUT_OF_RANGE");
        expect(result.capacityT).toBeNull();
        expect(result.utilisationPct).toBeNull();
    });

    test.each([
        1.0, 2.69,
    ])("returns OUT_OF_RANGE below the printed 2.7 m minimum radius (%s m)", (radiusM) => {
        // Before minRadiusM was stored, these radii incorrectly returned the
        // 5 t plateau and a 5 t pick could show a false PASS.
        const result = evaluatePick(MCT85F5, { loadT: 5, radiusM }, { jibM: 30 });

        expect(result.status).toBe("OUT_OF_RANGE");
        expect(result.capacityT).toBeNull();
        expect(result.utilisationPct).toBeNull();
    });

    test("accepts the printed 2.7 m minimum radius and representative valid radii", () => {
        // 5 t at 2.7 m is exactly 100 % of the 5 t plateau; 2.5 t at 10 m and
        // 2.5 t at 16.3 m are also inside the plateau and pass.
        const atMinimum = evaluatePick(MCT85F5, { loadT: 5, radiusM: 2.7 }, { jibM: 30 });
        const atTen = evaluatePick(MCT85F5, { loadT: 2.5, radiusM: 10 }, { jibM: 30 });
        const atPlateauEnd = evaluatePick(MCT85F5, { loadT: 2.5, radiusM: 16.3 }, { jibM: 30 });

        expect(atMinimum.status).toBe("PASS");
        expect(atMinimum.capacityT).toBeCloseTo(5, 10);
        expect(atMinimum.utilisationPct).toBeCloseTo(100, 10);
        expect(atTen.status).toBe("PASS");
        expect(atTen.capacityT).toBeCloseTo(5, 10);
        expect(atPlateauEnd.status).toBe("PASS");
        expect(atPlateauEnd.capacityT).toBeCloseTo(5, 10);
    });

    test("applies the SIMULATED wind derate to the chart capacity", () => {
        // No wind: 2.2 / 2.5 = 88 %, PASS.
        const calm = evaluatePick(MCT85F5, { loadT: 2.2, radiusM: 30 }, { jibM: 30 });
        expect(calm.status).toBe("PASS");
        expect(calm.utilisationPct).toBeCloseTo(88, 10);

        // Wind 20 km/h: 2.5 × 0.8 = 2.0 t; 2.2 / 2.0 = 110 %, FAIL.
        const windy = evaluatePick(MCT85F5, { loadT: 2.2, radiusM: 30 }, { jibM: 30, windKmh: 20 });
        expect(windy.capacityT).toBeCloseTo(2.0, 10);
        expect(windy.status).toBe("FAIL");
        expect(windy.utilisationPct).toBeCloseTo(110, 10);
    });
});

describe("findCranesPassingAllPicks", () => {
    test("returns only the cranes that pass every pick", () => {
        const passing = findCranesPassingAllPicks(
            [MCT88, SYNTHETIC_MINI, SYNTHETIC_WIDE],
            SAMPLE_PICKS.slice(0, 2),
        );

        expect(passing.map((evaluation) => evaluation.craneId)).toEqual(["potain-mct-88", "synthetic-wide"]);
        expect(passing.every((evaluation) => evaluation.allPass)).toBe(true);
    });

    test("returns no cranes if the list of picks is empty", () => {
        expect(findCranesPassingAllPicks([MCT88, SYNTHETIC_WIDE], [])).toEqual([]);
    });

    test("returns no cranes when every crane fails at least one pick", () => {
        const impossible: Pick[] = [{ loadT: 100, radiusM: 20 }];

        expect(findCranesPassingAllPicks([MCT88, SYNTHETIC_MINI, SYNTHETIC_WIDE], impossible)).toEqual([]);
    });

    test("filters the MCT 85 F5 using its own chart, not the MCT 88 curve", () => {
        // 4.0 t @ 20 m: MCT 88 capacity 4.05 t (PASS), MCT 85 F5 3.9 t (FAIL).
        const heavy = findCranesPassingAllPicks([MCT88, MCT85F5], [{ loadT: 4.0, radiusM: 20 }]);
        expect(heavy.map((evaluation) => evaluation.craneId)).toEqual(["potain-mct-88"]);

        // 2.5 t @ 20 m passes both: 4.05 t on the MCT 88, 3.9 t on the MCT 85 F5.
        const light = findCranesPassingAllPicks([MCT88, MCT85F5], [{ loadT: 2.5, radiusM: 20 }]);
        expect(light.map((evaluation) => evaluation.craneId)).toEqual(["potain-mct-88", "potain-mct-85-f5"]);
    });

    test("applies a per-crane jib override to the MCT 85 F5", () => {
        // 1.0 t at 52 m only fits the published 52 m configuration.
        const picks: Pick[] = [{ loadT: 1.0, radiusM: 52 }];

        expect(findCranesPassingAllPicks([MCT85F5], picks)).toEqual([]);
        expect(
            findCranesPassingAllPicks([MCT85F5], picks, {
                jibMByCrane: { "potain-mct-85-f5": 52 },
            }),
        ).toHaveLength(1);
    });

    test("applies jibMByCrane overrides and falls back to the shared jib", () => {
        // 2.66 t at 30 m passes on the 30 m jib (capacity 2.70 t) but fails on
        // the 35 m jib (2.27 t × 35 m / 30 m = 2.6483 t).
        const pick: Pick[] = [{ loadT: 2.66, radiusM: 30 }];

        expect(findCranesPassingAllPicks([MCT88], pick)).toHaveLength(1);
        expect(
            findCranesPassingAllPicks([MCT88], pick, {
                jibMByCrane: { "potain-mct-88": 35 },
            }),
        ).toEqual([]);
        expect(
            findCranesPassingAllPicks([MCT88], pick, {
                jibM: 35,
                jibMByCrane: { other: 30 },
            }),
        ).toEqual([]);
    });
});
