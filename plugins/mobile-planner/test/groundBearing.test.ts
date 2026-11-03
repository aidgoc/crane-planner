// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    calculatePadReactions,
    calculatePadReactionsFromLift,
    createGroundBearingPanel,
    evaluateGroundBearingVerdict,
    formatGroundBearingVerdictSummary,
    PLANNING_DISCLAIMER,
} from "../src";

describe("M4: Ground Bearing vs User Allowable & Stability Verdict (Sujal)", () => {
    // -------------------------------------------------------------------------
    // M4 Acceptance Test 1: Symmetric case with user allowable bearing capacity (PASS)
    // Hand calculation:
    //   Total weight W = 60.0 t, L = 8.0 m, B = 6.0 m, centered load (e_x = 0, e_y = 0)
    //   Each pad reaction R_i = 60.0 / 4 = 15.0 t
    //   Pad area A = 1.0 m²
    //   Pad pressure p_i = 15.0 / 1.0 = 15.0 t/m²
    //   In kPa: 15.0 * 9.80665 = 147.09975 kPa ≈ 147.10 kPa
    //   Allowable bearing capacity q_allowable = 20.0 t/m²
    //   15.0 <= 20.0 => PASS, isTipping = false, isAllowableExceeded = false
    // -------------------------------------------------------------------------
    test("symmetric load evaluates to PASS when pressure is within allowable bearing capacity", () => {
        const reactions = calculatePadReactions({
            totalWeightT: 60,
            lengthSpreadM: 8,
            widthSpreadM: 6,
            eccentricityXM: 0,
            eccentricityYM: 0,
        });

        const result = evaluateGroundBearingVerdict(reactions, 1.0, 20.0);

        expect(result.status).toBe("PASS");
        expect(result.isTipping).toBe(false);
        expect(result.isAllowableExceeded).toBe(false);
        expect(result.verdict).toContain("PASS");

        // Check all 4 pads
        const pads = [
            result.pads.frontLeft,
            result.pads.frontRight,
            result.pads.rearLeft,
            result.pads.rearRight,
        ];
        for (const pad of pads) {
            expect(pad.reactionT).toBeCloseTo(15.0, 6);
            expect(pad.pressureT_M2).toBeCloseTo(15.0, 6);
            expect(pad.pressureKPa).toBeCloseTo(15.0 * 9.80665, 4);
            expect(pad.status).toBe("PASS");
            expect(pad.isAllowableExceeded).toBe(false);
        }

        expect(result.peakPad.pressureT_M2).toBeCloseTo(15.0, 6);
        expect(result.disclaimer).toBe(PLANNING_DISCLAIMER);
    });

    // -------------------------------------------------------------------------
    // M4 Acceptance Test 2: Pad pressure exceeds user allowable (FAIL)
    // Hand calculation:
    //   Total weight W = 60.0 t, L = 8.0 m, B = 6.0 m
    //   Longitudinal offset e_x = 2.0 m, e_y = 0.0 m
    //   delta_x = (60.0 * 2.0) / (2 * 8.0) = 7.5 t
    //   R_front (FL, FR) = 15.0 + 7.5 = 22.5 t each
    //   R_rear (RL, RR) = 15.0 - 7.5 = 7.5 t each
    //   Pad area A = 1.0 m² => p_front = 22.5 t/m²
    //   User allowable q_allowable = 20.0 t/m²
    //   22.5 > 20.0 => FAIL (allowable exceeded), isTipping = false
    // -------------------------------------------------------------------------
    test("evaluates to FAIL when pad pressure exceeds user allowable bearing capacity", () => {
        const reactions = calculatePadReactions({
            totalWeightT: 60,
            lengthSpreadM: 8,
            widthSpreadM: 6,
            eccentricityXM: 2.0,
            eccentricityYM: 0.0,
        });

        const result = evaluateGroundBearingVerdict(reactions, 1.0, 20.0);

        expect(result.status).toBe("FAIL");
        expect(result.isTipping).toBe(false);
        expect(result.isAllowableExceeded).toBe(true);
        expect(result.verdict).toContain("FAIL: allowable bearing capacity exceeded");

        // Front pads exceed allowable
        expect(result.pads.frontLeft.status).toBe("FAIL");
        expect(result.pads.frontLeft.isAllowableExceeded).toBe(true);
        expect(result.pads.frontRight.status).toBe("FAIL");
        expect(result.pads.frontRight.isAllowableExceeded).toBe(true);

        // Rear pads remain within allowable
        expect(result.pads.rearLeft.status).toBe("PASS");
        expect(result.pads.rearLeft.isAllowableExceeded).toBe(false);
        expect(result.pads.rearRight.status).toBe("PASS");
        expect(result.pads.rearRight.isAllowableExceeded).toBe(false);

        expect(result.peakPad.pressureT_M2).toBeCloseTo(22.5, 6);
    });

    // -------------------------------------------------------------------------
    // M4 Acceptance Test 3: Tipping / Uplift detection (returns "tipping")
    // BACKLOG.md requirement:
    //   "a case where one pad reaction goes negative returns 'tipping'"
    // Hand calculation:
    //   W = 60.0 t, L = 8.0 m, B = 6.0 m
    //   Large diagonal offset: e_x = 3.0 m, e_y = 2.0 m
    //   delta_x = (60 * 3) / 16 = 11.25 t
    //   delta_y = (60 * 2) / 12 = 10.0 t
    //   R_FL = 15 + 11.25 + 10 = 36.25 t (compression)
    //   R_FR = 15 + 11.25 - 10 = 16.25 t (compression)
    //   R_RL = 15 - 11.25 + 10 = 13.75 t (compression)
    //   R_RR = 15 - 11.25 - 10 = -6.25 t (UPLIFT / TIPPING!)
    // -------------------------------------------------------------------------
    test("returns 'tipping' verdict when any pad reaction drops below zero", () => {
        const reactions = calculatePadReactions({
            totalWeightT: 60,
            lengthSpreadM: 8,
            widthSpreadM: 6,
            eccentricityXM: 3.0,
            eccentricityYM: 2.0,
        });

        expect(reactions.reactions.rearRight.reactionT).toBeCloseTo(-6.25, 6);
        expect(reactions.isStable).toBe(false);

        // Even with high allowable ground capacity (e.g. bedrock 100 t/m²), tipping is a safety failure
        const result = evaluateGroundBearingVerdict(reactions, 1.0, 100.0);

        expect(result.status).toBe("FAIL");
        expect(result.isTipping).toBe(true);
        // Explicitly checks the exact BACKLOG keyword "tipping"
        expect(result.verdict.toLowerCase()).toContain("tipping");
        expect(result.pads.rearRight.status).toBe("FAIL");
        expect(result.minPad.id).toBe("rearRight");
        expect(result.minPad.reactionT).toBeCloseTo(-6.25, 6);
    });

    // -------------------------------------------------------------------------
    // M4 Acceptance Test 4: Slew lift with non-zero craneCgOffsetM (Puja Review follow-up)
    // Hand calculation:
    //   Crane = 50.0 t with CG offset at (-1.0, 0.0) m (counterweight bias rearward)
    //   Lifted load = 10.0 t at radius 12.0 m, slew 0 deg (+X / front) -> (12.0, 0.0)
    //   Total weight W = 60.0 t
    //   Combined e_x = (50 * (-1.0) + 10 * 12.0) / 60 = 70 / 60 ≈ 1.166667 m
    //   Combined e_y = 0.0 m
    //   delta_x = (60 * (70/60)) / 16 = 70 / 16 = 4.375 t
    //   R_front = 15.0 + 4.375 = 19.375 t each
    //   R_rear = 15.0 - 4.375 = 10.625 t each
    //   Pad area = 1.0 m² => p_front = 19.375 t/m², p_rear = 10.625 t/m²
    //   Allowable bearing capacity = 25.0 t/m²
    //   19.375 <= 25.0 => PASS
    // -------------------------------------------------------------------------
    test("evaluates ground bearing correctly with non-zero craneCgOffsetM", () => {
        const reactions = calculatePadReactionsFromLift({
            craneWeightT: 50,
            liftedLoadT: 10,
            radiusM: 12,
            slewAngleDeg: 0,
            lengthSpreadM: 8,
            widthSpreadM: 6,
            craneCgOffsetM: { xM: -1.0, yM: 0 },
        });

        expect(reactions.totalWeightT).toBe(60);
        expect(reactions.reactions.frontLeft.reactionT).toBeCloseTo(19.375, 6);
        expect(reactions.reactions.rearLeft.reactionT).toBeCloseTo(10.625, 6);

        const result = evaluateGroundBearingVerdict(reactions, 1.0, 25.0);

        expect(result.status).toBe("PASS");
        expect(result.isTipping).toBe(false);
        expect(result.isAllowableExceeded).toBe(false);
        expect(result.peakPad.pressureT_M2).toBeCloseTo(19.375, 6);
        expect(result.peakPad.pressureKPa).toBeCloseTo(19.375 * 9.80665, 4);
    });

    // -------------------------------------------------------------------------
    // M4 Acceptance Test 5: Unchecked allowable (NOT_CHECKED status)
    // -------------------------------------------------------------------------
    test("returns NOT_CHECKED when no allowable bearing capacity is specified", () => {
        const reactions = calculatePadReactions({
            totalWeightT: 60,
            lengthSpreadM: 8,
            widthSpreadM: 6,
        });

        const result = evaluateGroundBearingVerdict(reactions, 1.0);

        expect(result.status).toBe("NOT_CHECKED");
        expect(result.isTipping).toBe(false);
        expect(result.isAllowableExceeded).toBe(false);
        expect(result.verdict).toContain("NOT_CHECKED");
    });

    // -------------------------------------------------------------------------
    // M4 Acceptance Test 6: Text summary formatter
    // -------------------------------------------------------------------------
    test("formats readable multi-line summary including peak pressure and disclaimer", () => {
        const reactions = calculatePadReactions({
            totalWeightT: 60,
            lengthSpreadM: 8,
            widthSpreadM: 6,
            eccentricityXM: 1.0,
        });
        const verdict = evaluateGroundBearingVerdict(reactions, 1.0, 25.0);
        const summary = formatGroundBearingVerdictSummary(verdict);

        expect(summary).toContain("Ground Bearing Assessment:");
        expect(summary).toContain("FL: 18.75 t/m²");
        expect(summary).toContain("RL: 11.25 t/m²");
        expect(summary).toContain("Peak Pressure: Front-Left (FL) @ 18.75 t/m²");
        expect(summary).toContain("Verdict: PASS");
        expect(summary).toContain(PLANNING_DISCLAIMER);
    });

    // -------------------------------------------------------------------------
    // M4 Acceptance Test 7: Interactive Ground Bearing UI Panel
    // -------------------------------------------------------------------------
    test("GroundBearingPanel mounts cleanly and updates live DOM with PASS/FAIL verdicts", () => {
        const controller = createGroundBearingPanel({
            defaultPadAreaM2: 1.0,
            defaultAllowableT_M2: 20.0,
        });

        expect(controller.element).toBeInstanceOf(HTMLElement);
        expect(controller.getPadAreaM2()).toBe(1.0);
        expect(controller.getAllowableBearingCapacityT_M2()).toBe(20.0);

        // Feed reactions: 22.5 t front, 7.5 t rear
        const reactions = calculatePadReactions({
            totalWeightT: 60,
            lengthSpreadM: 8,
            widthSpreadM: 6,
            eccentricityXM: 2.0,
        });

        const verdict = controller.update(reactions);
        expect(verdict.status).toBe("FAIL"); // 22.5 > 20.0
        expect(controller.getLatestVerdict()?.status).toBe("FAIL");

        // Verify DOM elements updated
        const html = controller.element.outerHTML;
        expect(html).toContain("Ground Bearing &amp; Outrigger Stability");
        expect(html).toContain("22.50 t");
        expect(html).toContain("7.50 t");
        expect(html).toContain(PLANNING_DISCLAIMER);
    });
});
