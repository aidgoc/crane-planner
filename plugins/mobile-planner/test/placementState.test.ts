// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// M8 — Placement State Wiring Tests
// Planning aid, not a certified lift plan.
// Owner: Ajit
//
// Every test includes a hand-worked calculation in its comment block so the
// expected values are independently verifiable.
// ============================================================================

import {
    computePlacement,
    createDefaultPlacementInput,
    type MobilePlacementInput,
    pickRadiusM,
    type SiteObstacle,
} from "../src/modules/placementState";

// ---------------------------------------------------------------------------
// Helper: create an input with overrides on top of the default
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<MobilePlacementInput> = {}): MobilePlacementInput {
    return { ...createDefaultPlacementInput(), ...overrides };
}

// ===========================================================================
// 1. Basic wiring — capacity, pad reactions and clearance computed together
// ===========================================================================

describe("M8 — computePlacement (live wiring)", () => {
    test("default INDICATIVE input returns a valid result with all fields populated", () => {
        // Hand calculation for default input:
        //   boomLengthM = 38, boomAngleDeg = 60
        //   operatingRadiusM = 38 * cos(60°) + 0.8 = 38 * 0.5 + 0.8 = 19.8 m
        //   Chart lookup: next radius >= 19.8 m is 20 m
        //   capacityAt(38, 20) = 30.5 t (from chart)
        //   totalSuspended = 10 + 0.5 = 10.5 t
        //   utilisation = 10.5 / 30.5 = 0.3443 (34.4%)
        //   capacityStatus = PASS (10.5 <= 30.5)

        const r = computePlacement(makeInput());

        expect(r.operatingRadiusM).toBeCloseTo(19.8, 1);
        expect(r.capacityT).toBe(30.5);
        expect(r.totalSuspendedLoadT).toBeCloseTo(10.5, 2);
        expect(r.utilisation).toBeCloseTo(10.5 / 30.5, 3);
        expect(r.capacityStatus).toBe("PASS");
        expect(r.padReactions.isStable).toBe(true);
        expect(r.allPass).toBe(true);
        expect(r.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("overloaded crane returns FAIL with utilisation > 100%", () => {
        // Hand calculation:
        //   Same boom geometry as default → capacity 30.5 t at 20 m
        //   payloadT = 35, riggingT = 0.5 → total = 35.5 t
        //   35.5 > 30.5 → FAIL
        //   utilisation = 35.5 / 30.5 = 1.164 (116.4%)

        const r = computePlacement(makeInput({ payloadT: 35 }));

        expect(r.capacityStatus).toBe("FAIL");
        expect(r.utilisation).toBeGreaterThan(1);
        expect(r.totalSuspendedLoadT).toBeCloseTo(35.5, 2);
        expect(r.allPass).toBe(false);
    });

    test("radius outside chart returns NO_DATA", () => {
        // Hand calculation:
        //   boomLengthM = 70, boomAngleDeg = 0
        //   operatingRadiusM = 70 * cos(0°) + 0.8 = 70.8 m
        //   Chart max radius for 70 m boom = 30 m → 70.8 > 30 → no lookup cell
        //   capacityStatus = NO_DATA

        const r = computePlacement(makeInput({ boomLengthM: 70, boomAngleDeg: 0 }));

        expect(r.operatingRadiusM).toBeCloseTo(70.8, 1);
        expect(r.capacityT).toBeNull();
        expect(r.capacityStatus).toBe("NO_DATA");
        expect(r.utilisation).toBeNull();
        expect(r.allPass).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 2. Pad reactions change with slew angle (no stale values)
    // -----------------------------------------------------------------------

    test("slew angle 0° vs 90° produces different pad reaction distributions", () => {
        // At slew = 0° load is along +X → front pads carry more.
        // At slew = 90° load is along +Y → left pads carry more.
        // The total weight stays the same; individual reactions shift.

        const base = makeInput({ slewAngleDeg: 0 });
        const r0 = computePlacement(base);
        const r90 = computePlacement({ ...base, slewAngleDeg: 90 });

        // Total weight must be identical
        expect(r0.padReactions.totalWeightT).toBeCloseTo(r90.padReactions.totalWeightT, 4);

        // FL reaction at 0° should differ from FL reaction at 90°
        expect(r0.padReactions.reactions.frontLeft.reactionT).not.toBeCloseTo(
            r90.padReactions.reactions.frontLeft.reactionT,
            2,
        );

        // Both must be stable (moderate load, centred crane weight)
        expect(r0.padReactions.isStable).toBe(true);
        expect(r90.padReactions.isStable).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 3. Symmetric centred load → equal pad reactions
    // -----------------------------------------------------------------------

    test("centred load (payload 0, crane weight only) gives equal pad reactions W/4", () => {
        // Hand calculation:
        //   craneWeightT = 84, payloadT = 0, riggingT = 0
        //   totalWeight = 84 + 0 = 84 t
        //   At slew = 0°, radiusM for payload = expectedRadiusM(38, 60) = 19.8 m
        //   But liftedLoad = 0, so eccentricity from load is 0.
        //   With craneCgOffset = (0, 0), resultant eccentricity = (0, 0).
        //   Each pad = 84 / 4 = 21.0 t

        const r = computePlacement(makeInput({ payloadT: 0, riggingT: 0 }));

        const eps = 0.01;
        expect(r.padReactions.reactions.frontLeft.reactionT).toBeCloseTo(21, eps);
        expect(r.padReactions.reactions.frontRight.reactionT).toBeCloseTo(21, eps);
        expect(r.padReactions.reactions.rearLeft.reactionT).toBeCloseTo(21, eps);
        expect(r.padReactions.reactions.rearRight.reactionT).toBeCloseTo(21, eps);
    });

    // -----------------------------------------------------------------------
    // 4. Moving crane position changes obstacle clearance
    // -----------------------------------------------------------------------

    test("moving crane closer to obstacle toggles clearance from PASS to FAIL", () => {
        // Obstacle "Tower A" at (50, 0), required clearance 2 m.
        // Default boom: operatingRadiusM ≈ 19.8 m
        //
        // Crane at (0, 0):
        //   distance = 50 m, margin = 50 - 19.8 - 2 = 28.2 m → PASS
        //
        // Crane at (35, 0):
        //   distance = 15 m, margin = 15 - 19.8 - 2 = -6.8 m → FAIL

        const obstacle: SiteObstacle = {
            label: "Tower A",
            xM: 50,
            yM: 0,
            requiredClearanceM: 2,
        };

        const far = computePlacement(makeInput({ craneCentreXM: 0 }), [obstacle]);
        expect(far.obstacleClearances[0].status).toBe("PASS");
        expect(far.obstacleClearances[0].marginM).toBeCloseTo(28.2, 1);
        expect(far.allPass).toBe(true);

        const near = computePlacement(makeInput({ craneCentreXM: 35 }), [obstacle]);
        expect(near.obstacleClearances[0].status).toBe("FAIL");
        expect(near.obstacleClearances[0].marginM).toBeCloseTo(-6.8, 1);
        expect(near.allPass).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 5. Ground bearing with allowable
    // -----------------------------------------------------------------------

    test("ground bearing PASS when allowable is generous, FAIL when tight", () => {
        // Hand calculation:
        //   Using default input → maxReactionT from padReactions.
        //   padAreaM2 = 1.0 m²
        //   pressureT_M2 = maxReactionT / 1.0
        //
        //   With allowable = 100 t/m² → likely PASS
        //   With allowable = 5 t/m²  → likely FAIL (maxReactionT > 5)

        const generous = computePlacement(makeInput({ allowableBearingT_M2: 100, padAreaM2: 1.0 }));
        expect(generous.worstPadBearing.status).toBe("PASS");

        const tight = computePlacement(makeInput({ allowableBearingT_M2: 5, padAreaM2: 1.0 }));
        expect(tight.worstPadBearing.status).toBe("FAIL");
    });

    test("no allowable → NOT_CHECKED (not false PASS)", () => {
        const r = computePlacement(makeInput({ allowableBearingT_M2: undefined }));
        expect(r.worstPadBearing.status).toBe("NOT_CHECKED");
    });

    // -----------------------------------------------------------------------
    // 6. Tipping detection
    // -----------------------------------------------------------------------

    test("extreme eccentric load causes tipping (negative pad reaction)", () => {
        // Hand calculation:
        //   craneWeightT = 10 (very light crane)
        //   payloadT = 100 (huge load)
        //   radiusM ≈ 19.8 m at boomAngleDeg = 60
        //   totalWeight = 110.5 t
        //   eccentricityXM = (10*0 + 100.5*19.8) / 110.5 ≈ 18.0 m
        //   deltaLong = 110.5 * 18.0 / (2 * 7.7) ≈ 129.2 t
        //   rearRight = 110.5/4 - 129.2 - 0 = 27.625 - 129.2 < 0 → TIPPING

        const r = computePlacement(
            makeInput({
                craneWeightT: 10,
                payloadT: 100,
            }),
        );

        expect(r.padReactions.isStable).toBe(false);
        expect(r.padReactions.minReactionT).toBeLessThan(0);
        expect(r.allPass).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 7. Multiple obstacles
    // -----------------------------------------------------------------------

    test("multiple obstacles each get individual clearance results", () => {
        const obstacles: SiteObstacle[] = [
            { label: "Tower A", xM: 50, yM: 0, requiredClearanceM: 2 },
            { label: "Power Line", xM: 0, yM: 25, requiredClearanceM: 6 },
        ];

        const r = computePlacement(makeInput(), obstacles);

        expect(r.obstacleClearances).toHaveLength(2);
        expect(r.obstacleClearances[0].label).toBe("Tower A");
        expect(r.obstacleClearances[1].label).toBe("Power Line");

        // Tower A at (50, 0): distance = 50 m, margin = 50 - 19.8 - 2 = 28.2 → PASS
        expect(r.obstacleClearances[0].status).toBe("PASS");

        // Power Line at (0, 25): distance = 25 m, margin = 25 - 19.8 - 6 = -0.8 → FAIL
        expect(r.obstacleClearances[1].status).toBe("FAIL");
        expect(r.obstacleClearances[1].marginM).toBeCloseTo(-0.8, 1);
    });

    // -----------------------------------------------------------------------
    // 8. Live update guarantee — changing one input recomputes everything
    // -----------------------------------------------------------------------

    test("changing boom angle recomputes radius, capacity AND pad reactions in one call", () => {
        // Boom 38 m at 60° → radius ≈ 19.8 m → chart 20 m → cap 30.5 t
        // Boom 38 m at 30° → radius = 38*cos(30°) + 0.8 = 38*0.866 + 0.8 = 33.7 m → chart = null (> 30)
        //   → NO_DATA

        const r60 = computePlacement(makeInput({ boomAngleDeg: 60 }));
        const r30 = computePlacement(makeInput({ boomAngleDeg: 30 }));

        expect(r60.operatingRadiusM).toBeCloseTo(19.8, 1);
        expect(r60.capacityT).toBe(30.5);

        expect(r30.operatingRadiusM).toBeCloseTo(33.71, 0);
        expect(r30.capacityT).toBeNull();

        // Pad reactions also differ because operating radius changed
        expect(r60.padReactions.reactions.frontLeft.reactionT).not.toBeCloseTo(
            r30.padReactions.reactions.frontLeft.reactionT,
            1,
        );
    });

    // -----------------------------------------------------------------------
    // 9. pickRadiusM convenience function
    // -----------------------------------------------------------------------

    test("pickRadiusM computes horizontal distance + PIVOT_OFFSET", () => {
        // Hand calculation:
        //   craneCentre = (10, 20), pickPoint = (13, 24)
        //   dx = 3, dy = 4 → hypot = 5 m
        //   radius = 5 + PIVOT_OFFSET_M (0.8) = 5.8 m

        const r = pickRadiusM({ xM: 10, yM: 20 }, { xM: 13, yM: 24 });
        expect(r).toBeCloseTo(5.8, 4);
    });

    // -----------------------------------------------------------------------
    // 10. Disclaimer is always present
    // -----------------------------------------------------------------------

    test("disclaimer is always present in result", () => {
        const r = computePlacement(makeInput());
        expect(r.disclaimer).toBe("Planning aid, not a certified lift plan.");
        expect(r.padReactions.disclaimer).toBe("Planning aid, not a certified lift plan.");
        expect(r.worstPadBearing.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    // -----------------------------------------------------------------------
    // 11. Specific chart cell verification (sourced)
    // -----------------------------------------------------------------------

    test("38 m boom at 10 m radius gives 53 t capacity (Grove GMK5250L-1, page 17)", () => {
        // Boom 38 m, target radius = 10 m
        // Need boomAngleDeg so that expectedRadiusM <= 10
        // 38 * cos(θ) + 0.8 <= 10 → cos(θ) <= 9.2/38 = 0.2421 → θ >= 75.99°
        // Use boomAngleDeg = 76 → radius = 38*cos(76°) + 0.8 = 38*0.2419 + 0.8 = 9.99 m
        // Chart lookup: next radius >= 9.99 → 10 m
        // capacityAt(38, 10) = 53 t

        const r = computePlacement(makeInput({ boomLengthM: 38, boomAngleDeg: 76, payloadT: 50 }));

        expect(r.operatingRadiusM).toBeCloseTo(10.0, 0);
        expect(r.capacityT).toBe(53);
        expect(r.capacityStatus).toBe("PASS"); // 50.5 <= 53
    });
});
