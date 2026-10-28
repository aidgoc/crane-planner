// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { capacityAt, expectedRadiusM, KIT, radiusFromPoint } from "../src/modules/craneModel";
import { createLiftSummary } from "../src/ui/liftSummary";

describe("mobile crane KIT", () => {
    test("is frozen and exposes source metadata", () => {
        expect(Object.isFrozen(KIT)).toBe(true);
        expect(KIT.name).toBe("Grove GMK5250L-1");
        expect(KIT.PIVOT_OFFSET_M).toBe(0.8);
        expect(KIT.source).toEqual({
            document: "Grove GMK5250L-1 load chart, official manufacturer download",
            url: "https://www.manitowoc.com/media/15016/download",
            page: 17,
            status: "INDICATIVE",
        });
    });

    test("uses the KIT pivot offset in the radius formula", () => {
        // Legacy formula: 32 m * cos(65.64 degrees) + 0.8 m = about 14.0 m.
        expect(expectedRadiusM(32, 65.64)).toBeCloseTo(14, 2);
        expect(radiusFromPoint({ xM: 3, yM: 4 })).toBeCloseTo(5.8, 6);
    });

    test("keeps the 70 m / 30 m chart cell at 12.1 t", () => {
        expect(capacityAt(70, 30)).toBeCloseTo(12.1, 6);
    });

    test.each([
        [52.4, 8],
        [13.3, 20],
        [99, 10],
        [38, 40],
    ])("refuses unsupported chart input %s m / %s m", (boomLengthM, radiusM) => {
        expect(capacityAt(boomLengthM, radiusM)).toBeNull();
    });

    test.each([
        [38, 12, 47.5],
        [52.4, 20, 23.5],
        [70, 30, 12.1],
    ])("%s m / %s m gives %s t", (boomLengthM, radiusM, expectedCapacityT) => {
        // Each expected value is a frozen Cycle 3 KIT acceptance cell.
        expect(capacityAt(boomLengthM, radiusM)).toBeCloseTo(expectedCapacityT, 6);
    });

    test.each([
        [38, 12, "47.5"],
        [52.4, 20, "23.5"],
        [70, 30, "12.1"],
    ])("UI adapter shares model for %s m / %s m", (boomLengthM, radiusM, expectedCapacityT) => {
        const summary = createLiftSummary({ boomLengthM, radiusM });
        expect(summary).toContain(`${capacityAt(boomLengthM, radiusM)?.toFixed(1)} t`);
        expect(summary).toContain(`${expectedCapacityT} t`);
        expect(summary).toContain(KIT.name);
        expect(summary).toContain("Planning aid, not a certified lift plan.");
    });
});
