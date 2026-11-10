// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import {
    createDefaultHeightParameters,
    evaluateHeightChecks,
    tieInLevels,
    validateHeightParameters,
} from "../src/model/heightChecks";
import type { HeightCheckInputs } from "../src/model/heightTypes";
import type { SiteBuilding } from "../src/model/oversailTypes";

function inputs(overrides: Partial<HeightCheckInputs> = {}): HeightCheckInputs {
    return {
        buildings: [
            { id: "tower_a", label: "TOWER A  G+24  75.0 m", heightM: 75 },
            { id: "podium", label: "PODIUM  2 levels  9.0 m", heightM: 9 },
        ],
        hookHeightM: 80,
        hookClearanceM: 2,
        freestandingHeightM: 50,
        tieInSpacingM: 20,
        ...overrides,
    };
}

describe("tower-planner height and tie-in checks (T9)", () => {
    test("Tower A 75 m with a 9 m podium requires a 77 m hook and tie-ins", () => {
        // Hand-worked calculation, from BACKLOG T9 and the sample-site README:
        // Tower A is 75 m above ground. The 9 m podium is a separate lower roof,
        // not an extra 9 m on top of Tower A: BACKLOG S3 extrudes the Tower A
        // footprint as a 40 x 22 x 75 = 66,000 m3 solid "before the podium", and
        // the sample README asks "does the hook clear Tower A at 75 m plus
        // clearance". The controlling height is therefore max(75, 9) = 75 m,
        // not 84 m. With the INDICATIVE 2 m hook clearance:
        // required hook height = 75 + 2 = 77 m.
        // Freestanding height 50 m < 77 m, so ties are needed at the freestanding
        // limit (50 m) and every 20 m below the required height: 50 m, 70 m.
        const report = evaluateHeightChecks(inputs());

        expect(report.valid).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.controllingBuilding?.id).toBe("tower_a");
        expect(report.buildingHeightM).toBe(75);
        expect(report.requiredHookHeightM).toBe(77);
        expect(report.providedHookHeightM).toBe(80);
        expect(report.tieInRequired).toBe(true);
        expect(report.tieInLevelsM).toEqual([50, 70]);
        expect(report.overallStatus).toBe("tie_in_required");

        const hook = report.results.find((result) => result.id === "hook_height");
        expect(hook?.status).toBe("pass");
        expect(hook?.message).toContain("77.0 m required");
        expect(hook?.message).toContain("individual building heights are not summed");

        const freestanding = report.results.find((result) => result.id === "freestanding");
        expect(freestanding?.status).toBe("tie_in_required");
        expect(freestanding?.message).toContain("freestanding height 50.0 m is below the required 77.0 m");

        const tieIn = report.results.find((result) => result.id === "tie_in");
        expect(tieIn?.status).toBe("tie_in_required");
        expect(tieIn?.message).toContain("Tie-in required at 2 level(s): 50.0, 70.0 m above ground");
    });

    test("a crane that is freestanding above the requirement needs no tie-ins", () => {
        // Hand-worked: required hook height 75 + 2 = 77 m. A 80 m freestanding
        // height covers it, so the tie-in list is empty and the overall status is pass.
        const report = evaluateHeightChecks(inputs({ freestandingHeightM: 80 }));

        expect(report.tieInRequired).toBe(false);
        expect(report.tieInLevelsM).toEqual([]);
        expect(report.overallStatus).toBe("pass");
        expect(report.results.find((result) => result.id === "tie_in")?.status).toBe("pass");
    });

    test("an available hook height below the requirement fails and reports the shortfall", () => {
        // Hand-worked: required 77 m, available 74 m -> short by 3.0 m.
        // The overall status stays fail even though tie-ins are also required.
        const report = evaluateHeightChecks(inputs({ hookHeightM: 74 }));

        const hook = report.results.find((result) => result.id === "hook_height");
        expect(hook?.status).toBe("fail");
        expect(hook?.availableM).toBe(74);
        expect(hook?.requiredM).toBe(77);
        expect(hook?.message).toContain("Hook height short by 3.0 m");
        expect(report.tieInRequired).toBe(true);
        expect(report.overallStatus).toBe("fail");
    });

    test("tie-in levels are placed at the freestanding limit and every spacing below the requirement", () => {
        // Hand-worked: freestanding 50 m, spacing 20 m.
        // Required exactly 70 m -> one tie at 50 m covers 70 m.
        // Required 70.1 m -> a second tie is needed at 70 m.
        // Required 50 m -> already freestanding, no ties.
        expect(tieInLevels(70, 50, 20)).toEqual([50]);
        expect(tieInLevels(70.1, 50, 20)).toEqual([50, 70]);
        expect(tieInLevels(50, 50, 20)).toEqual([]);
        expect(tieInLevels(77, 50, 20)).toEqual([50, 70]);
    });

    test("missing or invalid height inputs return unavailable instead of a pass", () => {
        const cases: { name: string; overrides: Partial<HeightCheckInputs>; error: string }[] = [
            {
                name: "no buildings",
                overrides: { buildings: [] },
                error: "no building heights were supplied",
            },
            {
                name: "missing building height",
                overrides: { buildings: [{ id: "tower_a", label: "TOWER A", heightM: undefined }] },
                error: "Building 'TOWER A' has no height.",
            },
            {
                name: "zero building height",
                overrides: { buildings: [{ id: "tower_a", label: "TOWER A", heightM: 0 }] },
                error: "Building 'TOWER A' height must be a finite number greater than 0 m.",
            },
            {
                name: "negative hook clearance",
                overrides: { hookClearanceM: -1 },
                error: "Hook clearance must be 0 m or greater.",
            },
            {
                name: "zero tie-in spacing",
                overrides: { tieInSpacingM: 0 },
                error: "Tie-in spacing must be greater than 0 m.",
            },
            {
                name: "non-finite hook height",
                overrides: { hookHeightM: Number.NaN },
                error: "Hook height must be greater than 0 m.",
            },
        ];

        for (const { name, overrides, error } of cases) {
            const report = evaluateHeightChecks(inputs(overrides));
            expect(report.valid, name).toBe(false);
            expect(report.overallStatus, name).toBe("unavailable");
            expect(report.results, name).toEqual([]);
            expect(report.errors.join(" "), name).toContain(error);
        }
    });

    test("default height parameters are INDICATIVE and validated", () => {
        const parameters = createDefaultHeightParameters();

        expect(parameters.hookHeight.source.kind).toBe("indicative");
        expect(parameters.hookClearance.source.kind).toBe("indicative");
        expect(parameters.freestandingHeight.source.kind).toBe("indicative");
        expect(parameters.tieInSpacing.source.kind).toBe("indicative");
        expect(validateHeightParameters(parameters)).toEqual([]);

        const invalid = {
            ...parameters,
            tieInSpacing: { ...parameters.tieInSpacing, value: 0 },
        };
        expect(validateHeightParameters(invalid)).toContain("Tie-in spacing must be greater than 0 m.");
    });

    test("the tallest individual building controls, not the sum of overlapping footprints", () => {
        // Hand-worked: Tower A 75 m and podium 9 m -> 75 m, not 84 m.
        // Adding a taller neighbour then changes the controlling height.
        const buildings: SiteBuilding[] = [
            { id: "tower_a", label: "TOWER A", heightM: 75 },
            { id: "podium", label: "PODIUM", heightM: 9 },
            { id: "tower_b", label: "TOWER B", heightM: 45 },
        ];
        const first = evaluateHeightChecks(inputs({ buildings }));
        expect(first.buildingHeightM).toBe(75);
        expect(first.requiredHookHeightM).toBe(77);

        const withTaller = [...buildings, { id: "tower_c", label: "TOWER C", heightM: 90 }];
        const second = evaluateHeightChecks(inputs({ buildings: withTaller }));
        expect(second.controllingBuilding?.id).toBe("tower_c");
        expect(second.requiredHookHeightM).toBe(92);
    });
});
