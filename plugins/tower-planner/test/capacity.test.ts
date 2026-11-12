// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { capacityAt, cornerRadiusAt, momentAt, tipLoadAt, WIND_DERATE_RULE } from "../src/capacity";
import { JASO_2R, JASO_TD, MCT85F5, MCT88 } from "../src/catalogue";
import type { CapacityModel, SourcedNumber } from "../src/types";

function indicative(value: number): SourcedNumber {
    return {
        value,
        provenance: {
            kind: "indicative",
            basis: "Synthetic test fixture, not a real crane.",
        },
    };
}

/** Clearly synthetic: no published tip-load rows, so no jib range can be derived. */
const EMPTY_MODEL: CapacityModel = {
    id: "synthetic-empty",
    name: "Synthetic Empty (test only)",
    maxCapacityT: indicative(5),
    defaultJibM: indicative(20),
    tipLoadByJib: [],
};

/** Clearly synthetic: a zero maximum capacity cannot define a corner radius. */
const INVALID_MAX_MODEL: CapacityModel = {
    ...EMPTY_MODEL,
    id: "synthetic-invalid-max",
    maxCapacityT: indicative(0),
};

/** Clearly synthetic: max 2 t, a 20 m maximum jib and 0.75 t at that tip. */
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

describe("tipLoadAt", () => {
    test.each([
        { jibM: 20, tipT: 3.95 },
        { jibM: 25, tipT: 3.0 },
        { jibM: 30, tipT: 2.5 },
        { jibM: 35, tipT: 2.22 },
        { jibM: 40, tipT: 1.9 },
        { jibM: 45, tipT: 1.65 },
        { jibM: 50, tipT: 1.4 },
        { jibM: 52, tipT: 1.1 },
    ])("returns the revised $jibM m tip load", ({ jibM, tipT }) => {
        expect(tipLoadAt(MCT88, jibM)).toBeCloseTo(tipT, 10);
    });

    test("interpolates linearly between published jib rows", () => {
        // Between 30 m (2.50 t) and 35 m (2.22 t): 2.50 + 0.5 × (2.22 - 2.50) = 2.36 t.
        expect(tipLoadAt(MCT88, 32.5)).toBeCloseTo(2.36, 10);
    });

    test("clamps below the first and above the last published row", () => {
        expect(tipLoadAt(MCT88, 10)).toBeCloseTo(3.95, 10);
        expect(tipLoadAt(MCT88, 60)).toBeCloseTo(1.1, 10);
    });

    test("rejects a non-finite jib length", () => {
        expect(() => tipLoadAt(MCT88, Number.NaN)).toThrow(RangeError);
    });
});

describe("momentAt and cornerRadiusAt", () => {
    test("matches the hand calculation for the 20 m jib", () => {
        // M = 3.95 t × 20 m = 79 t·m.
        expect(momentAt(MCT88, 20)).toBeCloseTo(79, 8);
        // corner = 79 / 5 = 15.8 m. These helpers are not the MCT 88 runtime
        // capacity model; capacityAt reads the published chart instead.
        expect(cornerRadiusAt(MCT88, 20)).toBeCloseTo(15.8, 8);
    });

    test("matches the hand calculation for the 30 m jib", () => {
        // M = 2.50 t × 30 m = 75 t·m.
        expect(momentAt(MCT88, 30)).toBeCloseTo(75, 8);
        // corner = 75 / 5 = 15.0 m.
        expect(cornerRadiusAt(MCT88, 30)).toBeCloseTo(15, 8);
    });
});

describe("capacityAt", () => {
    test("returns the 5 t plateau from the printed 2.7 m minimum radius", () => {
        // The printed minimum radius is 2.7 m; the 5 t plateau extends from
        // there to the first listed radius (16.3 m on the 30 m jib).
        expect(capacityAt(MCT88, 30, 2.7)).toBeCloseTo(5, 10);
        expect(capacityAt(MCT88, 30, 5)).toBeCloseTo(5, 10);
        expect(capacityAt(MCT88, 30, 16.3)).toBeCloseTo(5, 10);
    });

    test("returns null for zero or negative radius", () => {
        expect(capacityAt(MCT88, 30, 0)).toBeNull();
        expect(capacityAt(MCT88, 30, -1)).toBeNull();
    });

    test.each([
        // The 20 m jib's final point is 3.95 t; 3.90 t is the 25 m jib at 20 m.
        { jibM: 20, radiusM: 20, capacityT: 3.95 },
        { jibM: 25, radiusM: 25, capacityT: 3.0 },
        { jibM: 30, radiusM: 20, capacityT: 3.9 },
        { jibM: 30, radiusM: 22, capacityT: 3.5 },
        { jibM: 30, radiusM: 25, capacityT: 3.0 },
        { jibM: 30, radiusM: 27, capacityT: 2.75 },
        { jibM: 30, radiusM: 28, capacityT: 2.5 },
        { jibM: 30, radiusM: 29, capacityT: 2.5 },
        { jibM: 30, radiusM: 30, capacityT: 2.5 },
        { jibM: 52, radiusM: 52, capacityT: 1.1 },
    ])("returns $capacityT t at $radiusM m on the $jibM m jib", ({ jibM, radiusM, capacityT }) => {
        // The p. 4 5 t table is the capacity source. The 28 m case sits between
        // the printed 27 m and 29 m points, so the conservative step lookup
        // returns the value at 29 m.
        expect(capacityAt(MCT88, jibM, radiusM)).toBeCloseTo(capacityT, 10);
    });

    test("returns null beyond the installed jib", () => {
        expect(capacityAt(MCT88, 30, 30.1)).toBeNull();
        expect(capacityAt(MCT88, 30, 50)).toBeNull();
    });

    test("returns null for invalid jib or radius geometry", () => {
        expect(capacityAt(MCT88, 0, 10)).toBeNull();
        expect(capacityAt(MCT88, -30, 10)).toBeNull();
        expect(capacityAt(MCT88, Number.NaN, 10)).toBeNull();
        expect(capacityAt(MCT88, 30, Number.NaN)).toBeNull();
        expect(capacityAt(MCT88, 30, Number.POSITIVE_INFINITY)).toBeNull();
    });

    test("returns null above each model's own published maximum jib", () => {
        // MCT 88: 52 m working jib (53.1 m is the overall tip length). The p. 4
        // 5 t table prints 1.10 t at the 52 m endpoint; 1.10 × 0.8 = 0.88 t.
        expect(capacityAt(MCT88, 52, 52)).toBeCloseTo(1.1, 10);
        expect(capacityAt(MCT88, 52, 52, 20)).toBeCloseTo(0.88, 10);
        // Zero radius is invalid even at the maximum jib.
        expect(capacityAt(MCT88, 52, 0)).toBeNull();
        expect(capacityAt(MCT88, 52.000001, 30)).toBeNull();
        expect(capacityAt(MCT88, 53.1, 30)).toBeNull();
        expect(capacityAt(MCT88, 100, 30)).toBeNull();
        expect(capacityAt(MCT88, 100, 30, 20)).toBeNull();

        // MCT 85 F5: its own 52 m maximum working jib and printed 1.1 t chart
        // endpoint. The 53.1 m overall tip length is not a configuration.
        expect(capacityAt(MCT85F5, 52, 52)).toBeCloseTo(1.1, 10);
        expect(capacityAt(MCT85F5, 52.000001, 30)).toBeNull();
        expect(capacityAt(MCT85F5, 53.1, 30)).toBeNull();
        expect(capacityAt(MCT85F5, 100, 30)).toBeNull();

        // A synthetic model has its own 20 m maximum, so the guard is not
        // hard-coded to either catalogue crane. M = 0.75 t × 20 m = 15 t·m;
        // 15 / 10 m = 1.5 t.
        expect(capacityAt(SYNTHETIC_MINI, 20, 10)).toBeCloseTo(1.5, 10);
        expect(capacityAt(SYNTHETIC_MINI, 20.000001, 10)).toBeNull();
        expect(capacityAt(SYNTHETIC_MINI, 100, 10)).toBeNull();
    });

    test("applies the SIMULATED wind derate only at or above 20 km/h", () => {
        // 30 m jib at 30 m radius: 2.50 t × 0.8 = 2.00 t.
        expect(capacityAt(MCT88, 30, 30, 19.9)).toBeCloseTo(2.5, 10);
        expect(capacityAt(MCT88, 30, 30, 20)).toBeCloseTo(2.0, 10);
        expect(capacityAt(MCT88, 30, 30, 25)).toBeCloseTo(2.0, 10);
        expect(capacityAt(MCT88, 30, 30, 0)).toBeCloseTo(2.5, 10);
        expect(capacityAt(MCT88, 30, 30)).toBeCloseTo(2.5, 10);
        expect(capacityAt(MCT88, 30, 30, null)).toBeCloseTo(2.5, 10);
        expect(capacityAt(MCT88, 30, 30.1, 20)).toBeNull();

        // 30 m jib at 20 m radius: 3.90 t × 0.8 = 3.12 t.
        expect(capacityAt(MCT88, 30, 20, 20)).toBeCloseTo(3.12, 10);
        // 52 m jib at 52 m radius: 1.10 t × 0.8 = 0.88 t.
        expect(capacityAt(MCT88, 52, 52, 20)).toBeCloseTo(0.88, 10);
    });

    test("applies the wind factor exactly once", () => {
        // 2.50 t × 0.8 = 2.00 t. A second application would give 1.60 t.
        expect(capacityAt(MCT88, 30, 30, 20)).toBeCloseTo(2.0, 10);
        expect(capacityAt(MCT88, 30, 30, 100)).toBeCloseTo(2.0, 10);
        expect(capacityAt(MCT88, 30, 30, 100)).not.toBeCloseTo(2.5 * 0.8 * 0.8, 10);
    });

    test.each([
        { name: "negative", windKmh: -1 },
        { name: "NaN", windKmh: Number.NaN },
        { name: "positive infinity", windKmh: Number.POSITIVE_INFINITY },
        { name: "negative infinity", windKmh: Number.NEGATIVE_INFINITY },
    ])("returns null for $name wind instead of treating it as calm", ({ windKmh }) => {
        expect(capacityAt(MCT88, 30, 30, windKmh)).toBeNull();
    });

    test("labels the wind rule SIMULATED with the documented threshold and factor", () => {
        expect(WIND_DERATE_RULE.provenance).toBe("SIMULATED");
        expect(WIND_DERATE_RULE.thresholdKmh).toBe(20);
        expect(WIND_DERATE_RULE.factor).toBe(0.8);
    });
});

describe("MCT 88 published load chart", () => {
    // Source: Potain MCT 88 Data Sheet, PDF p. 4 top table (5 t hook): 8 jib
    // rows and 86 points. These are printed chart labels, not values from the
    // old 81/r moment formula. capacityAt uses this chart for MCT 88.
    test("uses the next larger published radius between chart points", () => {
        // 26 m lies between 25 m (3.0 t) and 27 m (2.75 t). Linear interpolation
        // would give 2.875 t; the conservative step lookup returns 2.75 t.
        expect(capacityAt(MCT88, 30, 26)).toBeCloseTo(2.75, 10);
        // 28 m lies between 27 m (2.75 t) and 29 m (2.5 t) -> 2.5 t.
        expect(capacityAt(MCT88, 30, 28)).toBeCloseTo(2.5, 10);
        // 28.43 m is still between those same two printed radii -> 2.5 t.
        expect(capacityAt(MCT88, 30, 28.43)).toBeCloseTo(2.5, 10);
        // 31 m lies between 29.1 m and 31.6 m, both printed as 2.5 t -> 2.5 t.
        expect(capacityAt(MCT88, 35, 31)).toBeCloseTo(2.5, 10);
        // 31.7 m lies between 31.6 m (2.5 t) and 32 m (2.45 t) -> 2.45 t.
        expect(capacityAt(MCT88, 35, 31.7)).toBeCloseTo(2.45, 10);
    });

    test("returns exactly the capacity at every published chart point", () => {
        const chart = MCT88.loadChart;
        expect(chart).toBeDefined();
        if (chart === undefined) throw new Error("MCT 88 load chart is missing.");
        expect(chart).toHaveLength(8);
        expect(chart.reduce((total, row) => total + row.points.length, 0)).toBe(86);

        for (const row of chart) {
            for (const point of row.points) {
                expect(capacityAt(MCT88, row.jibM.value, point.radiusM.value)).toBeCloseTo(
                    point.capacityT.value,
                    10,
                );
            }
        }
    });

    test("does not extrapolate beyond the last published radius", () => {
        expect(capacityAt(MCT88, 30, 30)).toBeCloseTo(2.5, 10);
        expect(capacityAt(MCT88, 30, 30.1)).toBeNull();
        expect(capacityAt(MCT88, 20, 20.1)).toBeNull();
        expect(capacityAt(MCT88, 35, 35.1)).toBeNull();
        expect(capacityAt(MCT88, 52, 52.1)).toBeNull();
    });

    test("does not invent a chart for an unpublished jib length", () => {
        // 32.5 m lies between the published 30 m and 35 m configurations, but
        // no chart is published for it; 53.1 m is the overall tip length, not a
        // working jib configuration.
        expect(MCT88.loadChart?.some((row) => row.jibM.value === 32.5)).toBe(false);
        expect(capacityAt(MCT88, 32.5, 20)).toBeNull();
        expect(capacityAt(MCT88, 32.5, 26)).toBeNull();
        expect(capacityAt(MCT88, 53.1, 20)).toBeNull();
    });

    test("uses the MCT 88 25 m chart endpoint of 3.00 t", () => {
        // p. 4 prints 3.00 t at 25 m on the 25 m jib; the MCT 85 F5 chart
        // prints 3.02 t at the same point. The chart is the capacity source.
        expect(tipLoadAt(MCT88, 25)).toBeCloseTo(3.0, 10);
        expect(capacityAt(MCT88, 25, 25)).toBeCloseTo(3.0, 10);
        expect(capacityAt(MCT88, 25, 25)).not.toBeCloseTo(3.02, 10);
    });

    test("uses the 52 m chart endpoint for the maximum working jib", () => {
        // p. 4: 13.7 m to 5 t, 52 m to 1.10 t.
        expect(capacityAt(MCT88, 52, 52)).toBeCloseTo(1.1, 10);
        expect(capacityAt(MCT88, 52, 13.7)).toBeCloseTo(5, 10);
    });
});

describe("MCT 85 F5 published load chart", () => {
    // Source: Potain MCT 85 F5 Data Sheet, PDF p. 3 (the document has no printed
    // page numbers). These are printed chart labels, not values derived from the
    // MCT 88 moment formula. The test tolerance is 1e-9 t: the lookup must return
    // the published number, not a rounded approximation.
    test.each([
        { jibM: 20, radiusM: 20, capacityT: 3.95 },
        { jibM: 25, radiusM: 25, capacityT: 3.02 },
        { jibM: 30, radiusM: 22, capacityT: 3.5 },
        { jibM: 35, radiusM: 31.6, capacityT: 2.5 },
        { jibM: 40, radiusM: 37, capacityT: 2.1 },
        { jibM: 45, radiusM: 42, capacityT: 1.8 },
        { jibM: 50, radiusM: 47, capacityT: 1.5 },
        { jibM: 52, radiusM: 50, capacityT: 1.15 },
    ])("returns the printed $capacityT t point at $radiusM m on the $jibM m jib", ({
        jibM,
        radiusM,
        capacityT,
    }) => {
        expect(capacityAt(MCT85F5, jibM, radiusM)).toBeCloseTo(capacityT, 9);
    });

    test("uses the capacity at the next larger radius between chart points", () => {
        // 19 m lies between 17 m (4.8 t) and 20 m (3.9 t). Linear interpolation
        // would give 4.48 t; the conservative step-down returns 3.9 t.
        expect(capacityAt(MCT85F5, 30, 19)).toBeCloseTo(3.9, 10);
        // 24 m lies between 22 m (3.5 t) and 25 m (3.0 t) -> 3.0 t.
        expect(capacityAt(MCT85F5, 30, 24)).toBeCloseTo(3.0, 10);
        // 28 m lies between 27 m (2.75 t) and 29 m (2.5 t) -> 2.5 t.
        expect(capacityAt(MCT85F5, 30, 28)).toBeCloseTo(2.5, 10);
    });

    test("never exceeds the capacity at the next larger published radius", () => {
        const chart = MCT85F5.loadChart?.find((row) => row.jibM.value === 30);
        if (chart === undefined) throw new Error("MCT 85 F5 30 m chart row is missing.");

        // At every published radius the lookup returns the printed value.
        for (const point of chart.points) {
            expect(capacityAt(MCT85F5, 30, point.radiusM.value)).toBeCloseTo(point.capacityT.value, 9);
        }

        // Between two points, the lookup must equal the upper (larger-radius)
        // point's capacity, i.e. the lower of the two bounding values.
        for (let index = 0; index < chart.points.length - 1; index++) {
            const lower = chart.points[index];
            const upper = chart.points[index + 1];
            const mid = (lower.radiusM.value + upper.radiusM.value) / 2;
            expect(capacityAt(MCT85F5, 30, mid)).toBeCloseTo(upper.capacityT.value, 9);
        }
    });

    test("returns the 5 t plateau from the printed 2.7 m minimum radius", () => {
        // The printed minimum radius is 2.7 m; the 5 t plateau extends from
        // there to the first listed radius (16.3 m on the 30 m jib).
        expect(capacityAt(MCT85F5, 30, 2.7)).toBeCloseTo(5, 10);
        expect(capacityAt(MCT85F5, 30, 10)).toBeCloseTo(5, 10);
        expect(capacityAt(MCT85F5, 30, 16.3)).toBeCloseTo(5, 10);
    });

    test.each([1.0, 2.69])("returns null below the printed 2.7 m minimum radius (%s m)", (radiusM) => {
        // 2.69 m is below the published minimum, even though it is inside the
        // 5 t plateau's first stored point at 16.3 m. Returning 5 t here was the
        // false-PASS bug: a 5 t pick at 1 m would otherwise look acceptable.
        expect(capacityAt(MCT85F5, 30, radiusM)).toBeNull();
        expect(capacityAt(MCT85F5, 52, radiusM)).toBeNull();
    });

    test("stores the printed 2.7 m minimum on every chart row", () => {
        for (const chart of MCT85F5.loadChart ?? []) {
            expect(chart.minRadiusM.value).toBe(2.7);
            expect(chart.minRadiusM.provenance).toEqual({
                kind: "source",
                sourceId: "datasheetLoadCharts",
            });
        }
    });

    test("does not invent a chart for an unpublished jib length", () => {
        // 32.5 m lies between the published 30 m and 35 m configurations, but
        // no chart is published for it; 53.1 m is the overall tip length, not a
        // working jib configuration.
        expect(capacityAt(MCT85F5, 32.5, 20)).toBeNull();
        expect(capacityAt(MCT85F5, 53.1, 20)).toBeNull();
    });

    test("does not extrapolate beyond the last chart radius", () => {
        expect(capacityAt(MCT85F5, 30, 30)).toBeCloseTo(2.5, 10);
        expect(capacityAt(MCT85F5, 30, 30.1)).toBeNull();
    });

    test("uses the printed chart value where p. 1 rounds the 25 m tip load", () => {
        // p. 1 labels the 25 m tip load as 3 t; p. 3 prints 3.02 t at the last
        // chart point. The chart is the capacity source, so 3.02 t is returned.
        expect(tipLoadAt(MCT85F5, 25)).toBeCloseTo(3.0, 10);
        expect(capacityAt(MCT85F5, 25, 25)).toBeCloseTo(3.02, 10);
    });

    test("uses the 52 m chart endpoint for the maximum working jib", () => {
        // p. 1: 52 m working jib, 1.1 t tip load. p. 3: 13.7 m to 5 t.
        expect(capacityAt(MCT85F5, 52, 52)).toBeCloseTo(1.1, 10);
        expect(capacityAt(MCT85F5, 52, 13.7)).toBeCloseTo(5, 10);
    });

    test("applies the SIMULATED wind derate to the chart capacity", () => {
        // 3.0 t at 25 m on the 30 m jib × 0.8 = 2.4 t. The derate is a product
        // rule, not a manufacturer or standards rule.
        expect(capacityAt(MCT85F5, 30, 25, 19.9)).toBeCloseTo(3.0, 10);
        expect(capacityAt(MCT85F5, 30, 25, 20)).toBeCloseTo(2.4, 10);
        expect(capacityAt(MCT85F5, 30, 25, 25)).toBeCloseTo(2.4, 10);
        expect(capacityAt(MCT85F5, 30, 25, null)).toBeCloseTo(3.0, 10);
    });
});

describe("Cycle 2 imperial chart comparison", () => {
    // Historical Cycle 2 sanity check: the reference values are the converted
    // imperial readings (4.3 USt -> 3.90 t, 3.3 USt -> 2.99 t, 2.8 USt -> 2.54 t),
    // retained only to confirm the published-chart lookup stays within ±10 % of
    // the old comparison. They are not capacity-model inputs or a current
    // source-document table; the computed values come from the real capacityAt
    // function, not a fixture.
    // The 20.0 m case uses the printed 20 m chart point; just above it the
    // conservative step lookup moves to the 22 m point (3.5 t), which is a
    // deliberate understatement rather than a like-for-like chart comparison.
    test.each([
        { radiusM: 20.0, referenceT: 3.9 },
        { radiusM: 25.0, referenceT: 2.99 },
        { radiusM: 29.9, referenceT: 2.54 },
    ])("stays within ±10 % of the converted chart at $radiusM m", ({ radiusM, referenceT }) => {
        const capacityT = capacityAt(MCT88, 30, radiusM);

        expect(capacityT).not.toBeNull();
        if (capacityT === null) throw new Error(`No capacity at ${radiusM} m on the 30 m jib.`);

        const errorPct = (Math.abs(capacityT - referenceT) / referenceT) * 100;
        expect(errorPct).toBeLessThanOrEqual(10);
    });
});

describe("luffing-jib entries", () => {
    // The JASO entries publish a 213 ft (64.9224 m) load chart, but a luffing
    // jib changes radius by luffing rather than by a trolley. The trolley-jib
    // capacity rules do not describe that geometry, so capacityAt must refuse
    // even a jib/radius pair that appears in the published table.
    test.each([
        { crane: JASO_TD, name: "JASO TD" },
        { crane: JASO_2R, name: "JASO 2R" },
    ])("capacityAt refuses the $name luffing-jib model", ({ crane }) => {
        expect(capacityAt(crane, 64.9224, 24.9936)).toBeNull();
        expect(capacityAt(crane, 64.9224, 30)).toBeNull();
        expect(capacityAt(crane, 64.9224, 64.9224)).toBeNull();
        expect(capacityAt(crane, 64.9224, 24.9936, 20)).toBeNull();
    });

    test("does not use the luffing-jib chart even when the jib is in range", () => {
        // Sanity check that the chart is present: the guard, not missing data,
        // is what produces the null result.
        expect(JASO_TD.loadChart?.[0].points).toHaveLength(9);
        expect(JASO_TD.craneType).toBe("luffing-jib");
        expect(capacityAt(JASO_TD, JASO_TD.defaultJibM.value, 30)).toBeNull();
    });
});

describe("invalid synthetic models", () => {
    test("rejects a model with no tip-load rows", () => {
        expect(() => tipLoadAt(EMPTY_MODEL, 20)).toThrow(RangeError);
        expect(capacityAt(EMPTY_MODEL, 20, 10)).toBeNull();
    });

    test("rejects a model with a non-positive maximum capacity", () => {
        expect(() => cornerRadiusAt(INVALID_MAX_MODEL, 20)).toThrow(RangeError);
        expect(capacityAt(INVALID_MAX_MODEL, 20, 10)).toBeNull();
    });
});
