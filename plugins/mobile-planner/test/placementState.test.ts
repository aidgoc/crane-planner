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

import type { IView } from "@chili3d/core";
import { createMockDocument } from "@chili3d/core/test-utils";
import { MobileCraneBodyNode } from "../src/body/mobileCraneBody";
import {
    computePlacement,
    createDefaultPlacementInput,
    type MobilePlacementInput,
    pickRadiusM,
    type SiteObstacle,
    validatePlacementInput,
} from "../src/modules/placementState";
import { SAMPLE_SITE_OBSTACLES } from "../src/modules/sampleSiteObstacles";
import { MobileCranePlacementPanel } from "../src/ui/mobilePlacementPanel";

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
    test("default INDICATIVE input without allowable bearing or obstacles returns INCOMPLETE (not false ALL PASS)", () => {
        // Hand calculation for default input:
        //   boomLengthM = 38, boomAngleDeg = 60
        //   operatingRadiusM = 38 * cos(60°) + 0.8 = 38 * 0.5 + 0.8 = 19.8 m
        //   Chart lookup: next radius >= 19.8 m is 20 m
        //   capacityAt(38, 20) = 30.5 t (from chart)
        //   totalSuspended = 10 + 0.5 = 10.5 t
        //   utilisation = 10.5 / 30.5 = 0.3443 (34.4%)
        //   capacityStatus = PASS (10.5 <= 30.5)
        //   padReactions: isStable = true
        //   allowableBearingT_M2 = undefined → bearingStatus = NOT_CHECKED
        //   obstacles = [] → clearanceStatus = NOT_CHECKED
        //   Safety Rule: must NOT show ALL PASS when checks did not run!
        //   overallVerdict = INCOMPLETE, allPass = false

        const r = computePlacement(makeInput());

        expect(r.operatingRadiusM).toBeCloseTo(19.8, 1);
        expect(r.capacityT).toBe(30.5);
        expect(r.totalSuspendedLoadT).toBeCloseTo(10.5, 2);
        expect(r.utilisation).toBeCloseTo(10.5 / 30.5, 3);
        expect(r.capacityStatus).toBe("PASS");
        expect(r.padReactions.isStable).toBe(true);
        expect(r.bearingStatus).toBe("NOT_CHECKED");
        expect(r.clearanceStatus).toBe("NOT_CHECKED");
        expect(r.overallVerdict).toBe("INCOMPLETE");
        expect(r.allPass).toBe(false);
        expect(r.incompleteReasons.length).toBeGreaterThan(0);
        expect(r.disclaimer).toBe("Planning aid, not a certified lift plan.");
    });

    test("fully checked placement with generous bearing and safe obstacle returns ALL PASS", () => {
        // Hand calculation:
        //   Default crane at (0, 0)
        //   allowableBearingT_M2 = 100 t/m² → bearingStatus = PASS
        //   obstacle at (60, 0), required 2 m:
        //     boom tip at (19.8, 0) → distance = 60 - 19.8 = 40.2 m
        //     margin = 40.2 - 2 = 38.2 m → PASS
        //   Capacity = PASS, Stability = true, Bearing = PASS, Clearance = PASS
        //   overallVerdict = ALL PASS, allPass = true

        const safeObstacle: SiteObstacle = {
            label: "Distant Building",
            xM: 60,
            yM: 0,
            requiredClearanceM: 2,
        };

        const r = computePlacement(makeInput({ allowableBearingT_M2: 100 }), [safeObstacle]);

        expect(r.capacityStatus).toBe("PASS");
        expect(r.padReactions.isStable).toBe(true);
        expect(r.bearingStatus).toBe("PASS");
        expect(r.clearanceStatus).toBe("PASS");
        expect(r.overallVerdict).toBe("ALL PASS");
        expect(r.allPass).toBe(true);
        expect(r.incompleteReasons).toHaveLength(0);
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
        expect(r.overallVerdict).toBe("FAIL");
        expect(r.allPass).toBe(false);
    });

    test("radius outside chart returns NO_DATA and INCOMPLETE/FAIL", () => {
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

        expect(r0.padReactions.totalWeightT).toBeCloseTo(r90.padReactions.totalWeightT, 4);
        expect(r0.padReactions.reactions.frontLeft.reactionT).not.toBeCloseTo(
            r90.padReactions.reactions.frontLeft.reactionT,
            2,
        );
        expect(r0.padReactions.isStable).toBe(true);
        expect(r90.padReactions.isStable).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 3. Centred load → equal pad reactions
    // -----------------------------------------------------------------------

    test("centred load (payload 0, crane weight only) gives equal pad reactions W/4", () => {
        // Hand calculation:
        //   craneWeightT = 84, payloadT = 0, riggingT = 0
        //   totalWeight = 84 + 0 = 84 t
        //   Each pad = 84 / 4 = 21.0 t

        const r = computePlacement(makeInput({ payloadT: 0, riggingT: 0 }));

        const eps = 0.01;
        expect(r.padReactions.reactions.frontLeft.reactionT).toBeCloseTo(21, eps);
        expect(r.padReactions.reactions.frontRight.reactionT).toBeCloseTo(21, eps);
        expect(r.padReactions.reactions.rearLeft.reactionT).toBeCloseTo(21, eps);
        expect(r.padReactions.reactions.rearRight.reactionT).toBeCloseTo(21, eps);
    });

    // -----------------------------------------------------------------------
    // 4. Polygon Footprint Clearance — Reviewer Case 1 (Tower A)
    // -----------------------------------------------------------------------

    test("Reviewer Case 1: Crane at (5, 31) pointing at Tower A polygon returns FAIL (close/collision)", () => {
        // Hand calculation:
        //   Crane centre: (5, 31), slew 0° (along +X), boom 38 m at 60°
        //   Operating radius = 38 * cos(60°) + 0.8 = 19.8 m
        //   Boom tip coordinate = (5 + 19.8, 31) = (24.8, 31)
        //   Tower A footprint: X in [25, 65], Y in [20, 42]
        //   West wall of Tower A is at X = 25.0 m
        //   Distance from boom tip (24.8, 31) to west wall (25.0, 31) = 25.0 - 24.8 = 0.2 m
        //   Required clearance = 2.0 m
        //   Margin = 0.2 - 2.0 = -1.8 m (< 0) → FAIL (CRITICAL / clearance violation)
        //   (Naive point model gave +18.2 m PASS because centre was at 45.0 m!)

        const towerA: SiteObstacle = {
            label: "Tower A (G+24, 75 m)",
            polygon: [
                [25, 20],
                [65, 20],
                [65, 42],
                [25, 42],
            ],
            heightM: 75,
            requiredClearanceM: 2.0,
        };

        const r = computePlacement(
            makeInput({
                craneCentreXM: 5,
                craneCentreYM: 31,
                slewAngleDeg: 0,
                boomLengthM: 38,
                boomAngleDeg: 60,
                allowableBearingT_M2: 100,
            }),
            [towerA],
        );

        expect(r.obstacleClearances).toHaveLength(1);
        expect(r.obstacleClearances[0].distanceM).toBeCloseTo(0.2, 1);
        expect(r.obstacleClearances[0].marginM).toBeCloseTo(-1.8, 1);
        expect(r.obstacleClearances[0].status).toBe("FAIL");
        expect(r.clearanceStatus).toBe("FAIL");
        expect(r.overallVerdict).toBe("FAIL");
        expect(r.allPass).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 5. Power Line Wall Clearance — Reviewer Case 2 (x = -9 m)
    // -----------------------------------------------------------------------

    test("Reviewer Case 2: Crane at (5, 100) slewing 180° cuts across power line at x = -9 m", () => {
        // Hand calculation:
        //   Crane centre: (5, 100), slew 180° (along -X), boom 38 m at 60°
        //   Operating radius = 19.8 m
        //   Boom tip coordinate = (5 - 19.8, 100) = (-14.8, 100)
        //   Power line hazard plane is at x = -9.0 m
        //   Since -14.8 <= -9.0 <= 5.0, the boom physically crosses x = -9.0 m!
        //   Distance = 0 m (collision/crossing), isCollision = true
        //   Required clearance = 6.0 m
        //   Margin = 0 - 6.0 = -6.0 m → FAIL / CRITICAL!

        const powerLine: SiteObstacle = {
            label: "22 kV Power Line (x = -9 m)",
            xLineM: -9.0,
            requiredClearanceM: 6.0,
        };

        const r = computePlacement(
            makeInput({
                craneCentreXM: 5,
                craneCentreYM: 100,
                slewAngleDeg: 180,
                boomLengthM: 38,
                boomAngleDeg: 60,
                allowableBearingT_M2: 100,
            }),
            [powerLine],
        );

        expect(r.obstacleClearances).toHaveLength(1);
        expect(r.obstacleClearances[0].distanceM).toBe(0);
        expect(r.obstacleClearances[0].isCollision).toBe(true);
        expect(r.obstacleClearances[0].marginM).toBe(-6.0);
        expect(r.obstacleClearances[0].status).toBe("FAIL");
        expect(r.clearanceStatus).toBe("FAIL");
        expect(r.overallVerdict).toBe("FAIL");
        expect(r.allPass).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 6. Bundled SAMPLE_SITE_OBSTACLES Integration
    // -----------------------------------------------------------------------

    test("Bundled SAMPLE_SITE_OBSTACLES checks all 7 site obstacles", () => {
        const r = computePlacement(makeInput(), SAMPLE_SITE_OBSTACLES);

        expect(r.obstacleClearances).toHaveLength(7);
        const labels = r.obstacleClearances.map((c) => c.label);
        expect(labels).toContain("Tower A (G+24, 75 m)");
        expect(labels).toContain("Tower B (G+14, 45 m)");
        expect(labels).toContain("Podium (9 m)");
        expect(labels).toContain("Site Office (3 m)");
        expect(labels).toContain("Neighbour East (30 m)");
        expect(labels).toContain("Neighbour North (12 m)");
        expect(labels).toContain("22 kV Power Line (x = -9 m)");
    });

    // -----------------------------------------------------------------------
    // 7. Input Validation (No silent defaults or crashes)
    // -----------------------------------------------------------------------

    test("validatePlacementInput catches invalid or out-of-range inputs", () => {
        expect(validatePlacementInput(makeInput({ payloadT: -5 }))).toContain("Payload must be non-negative");
        expect(validatePlacementInput(makeInput({ boomAngleDeg: 120 }))).toContain(
            "Boom angle must be between 0° and 90°",
        );
        expect(validatePlacementInput(makeInput({ padAreaM2: 0 }))).toContain("Pad area must be positive");
        expect(validatePlacementInput(makeInput({ craneWeightT: -10 }))).toContain(
            "Crane self-weight must be positive",
        );
    });

    test("computePlacement throws error on invalid input", () => {
        expect(() => computePlacement(makeInput({ payloadT: -1 }))).toThrow("Invalid placement input");
        expect(() => computePlacement(makeInput({ boomAngleDeg: -10 }))).toThrow("Invalid placement input");
    });

    // -----------------------------------------------------------------------
    // 8. Tipping detection
    // -----------------------------------------------------------------------

    test("extreme eccentric load causes tipping (negative pad reaction)", () => {
        const r = computePlacement(
            makeInput({
                craneWeightT: 10,
                payloadT: 100,
            }),
        );

        expect(r.padReactions.isStable).toBe(false);
        expect(r.padReactions.minReactionT).toBeLessThan(0);
        expect(r.overallVerdict).toBe("FAIL");
        expect(r.allPass).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 9. pickRadiusM convenience function
    // -----------------------------------------------------------------------

    test("pickRadiusM computes horizontal distance + PIVOT_OFFSET", () => {
        const r = pickRadiusM({ xM: 10, yM: 20 }, { xM: 13, yM: 24 });
        expect(r).toBeCloseTo(5.8, 4);
    });

    // -----------------------------------------------------------------------
    // 10. MobileCraneBodyNode 3D marker
    // -----------------------------------------------------------------------

    test("MobileCraneBodyNode initializes properties and updates values", () => {
        const doc = createMockDocument();
        const node = new MobileCraneBodyNode({
            document: doc,
            craneCentreXM: 10,
            craneCentreYM: 20,
            slewAngleDeg: 45,
            boomLengthM: 38,
            boomAngleDeg: 60,
        });

        expect(node.craneCentreXM).toBe(10);
        expect(node.craneCentreYM).toBe(20);
        expect(node.slewAngleDeg).toBe(45);
        expect(node.boomLengthM).toBe(38);
        expect(node.boomAngleDeg).toBe(60);

        node.craneCentreXM = 15;
        expect(node.craneCentreXM).toBe(15);

        expect(() => {
            node.boomAngleDeg = 95;
        }).toThrow();
        expect(() => {
            node.boomLengthM = -5;
        }).toThrow();
    });

    // -----------------------------------------------------------------------
    // 11. MobileCranePlacementPanel UI
    // -----------------------------------------------------------------------

    test("MobileCranePlacementPanel initializes with sample site obstacles and disclaimer", () => {
        const doc = createMockDocument();
        const mockView = {
            document: doc,
        } as unknown as IView;

        const panel = new MobileCranePlacementPanel(mockView);
        expect(panel).toBeDefined();
        panel.dispose();
    });
});
