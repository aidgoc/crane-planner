// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Task M3: Outrigger Footprint Polygon on Plan (CI-2 Acceptance Tests)
// Owner: Sujal
// ============================================================================

import type { IShape, IShapeFactory, IView, Plane, Result, XYZ } from "@chili3d/core";
import { createMockDocument } from "@chili3d/core/test-utils";
import { MobileCraneBodyNode } from "../src/body/mobileCraneBody";
import { PLANNING_DISCLAIMER } from "../src/modules/outriggers";
import { MobileCranePlacementPanel } from "../src/ui/mobilePlacementPanel";

describe("M3: Outrigger Footprint Polygon on Plan (Sujal)", () => {
    // -------------------------------------------------------------------------
    // Test 1: Property initialization and validation
    // -------------------------------------------------------------------------
    test("MobileCraneBodyNode initializes outrigger spread properties and rejects invalid values", () => {
        const doc = createMockDocument();
        const node = new MobileCraneBodyNode({
            document: doc,
            craneCentreXM: 10,
            craneCentreYM: 20,
            outriggerLengthSpreadM: 8.0,
            outriggerWidthSpreadM: 6.0,
            padAreaM2: 1.5,
        });

        expect(node.outriggerLengthSpreadM).toBe(8.0);
        expect(node.outriggerWidthSpreadM).toBe(6.0);
        expect(node.padAreaM2).toBe(1.5);

        // Dynamic updates
        node.outriggerLengthSpreadM = 9.2;
        expect(node.outriggerLengthSpreadM).toBe(9.2);

        node.outriggerWidthSpreadM = 7.5;
        expect(node.outriggerWidthSpreadM).toBe(7.5);

        node.padAreaM2 = 2.0;
        expect(node.padAreaM2).toBe(2.0);

        // Invalid inputs
        expect(() => {
            node.outriggerLengthSpreadM = 0;
        }).toThrow("outriggerLengthSpreadM must be strictly positive");

        expect(() => {
            node.outriggerLengthSpreadM = -5;
        }).toThrow("outriggerLengthSpreadM must be strictly positive");

        expect(() => {
            node.outriggerWidthSpreadM = Number.NaN;
        }).toThrow("outriggerWidthSpreadM must be strictly positive");

        expect(() => {
            node.padAreaM2 = 0;
        }).toThrow("padAreaM2 must be strictly positive");
    });

    // -------------------------------------------------------------------------
    // Test 2: Footprint coordinates match exact hand calculations at origin
    // Hand calculation:
    //   Crane at (0, 0) m
    //   Longitudinal spread L = 7.7 m => halfL = 3.85 m
    //   Transverse spread B = 7.2 m   => halfB = 3.60 m
    //   FL = (+3.85, +3.60) m
    //   FR = (+3.85, -3.60) m
    //   RL = (-3.85, +3.60) m
    //   RR = (-3.85, -3.60) m
    //   Polygon: CCW [FL, RL, RR, FR]
    // -------------------------------------------------------------------------
    test("getFootprint returns exact hand-calculated pad coordinates for crane at origin", () => {
        const doc = createMockDocument();
        const node = new MobileCraneBodyNode({
            document: doc,
            craneCentreXM: 0,
            craneCentreYM: 0,
            outriggerLengthSpreadM: 7.7,
            outriggerWidthSpreadM: 7.2,
        });

        const fp = node.getFootprint();
        expect(fp.lengthSpreadM).toBe(7.7);
        expect(fp.widthSpreadM).toBe(7.2);

        expect(fp.pads.frontLeft.xM).toBeCloseTo(3.85, 6);
        expect(fp.pads.frontLeft.yM).toBeCloseTo(3.6, 6);

        expect(fp.pads.frontRight.xM).toBeCloseTo(3.85, 6);
        expect(fp.pads.frontRight.yM).toBeCloseTo(-3.6, 6);

        expect(fp.pads.rearLeft.xM).toBeCloseTo(-3.85, 6);
        expect(fp.pads.rearLeft.yM).toBeCloseTo(3.6, 6);

        expect(fp.pads.rearRight.xM).toBeCloseTo(-3.85, 6);
        expect(fp.pads.rearRight.yM).toBeCloseTo(-3.6, 6);

        // Verify closed 4-point polygon
        expect(fp.polygon).toHaveLength(4);
        expect(fp.polygon[0]).toEqual(fp.pads.frontLeft);
        expect(fp.polygon[1]).toEqual(fp.pads.rearLeft);
        expect(fp.polygon[2]).toEqual(fp.pads.rearRight);
        expect(fp.polygon[3]).toEqual(fp.pads.frontRight);
    });

    // -------------------------------------------------------------------------
    // Test 3: Footprint coordinates follow translated crane position on site
    // Hand calculation:
    //   Crane centre at (15.0, 25.0) m
    //   Spread L = 8.0 m => halfL = 4.0 m
    //   Spread B = 6.0 m => halfB = 3.0 m
    //   FL = (15.0 + 4.0, 25.0 + 3.0) = (19.0, 28.0) m
    //   FR = (15.0 + 4.0, 25.0 - 3.0) = (19.0, 22.0) m
    //   RL = (15.0 - 4.0, 25.0 + 3.0) = (11.0, 28.0) m
    //   RR = (15.0 - 4.0, 25.0 - 3.0) = (11.0, 22.0) m
    // -------------------------------------------------------------------------
    test("getFootprint follows translated crane coordinates on the site plan", () => {
        const doc = createMockDocument();
        const node = new MobileCraneBodyNode({
            document: doc,
            craneCentreXM: 15.0,
            craneCentreYM: 25.0,
            outriggerLengthSpreadM: 8.0,
            outriggerWidthSpreadM: 6.0,
        });

        const fp = node.getFootprint();
        expect(fp.pads.frontLeft).toEqual({ xM: 19.0, yM: 28.0 });
        expect(fp.pads.frontRight).toEqual({ xM: 19.0, yM: 22.0 });
        expect(fp.pads.rearLeft).toEqual({ xM: 11.0, yM: 28.0 });
        expect(fp.pads.rearRight).toEqual({ xM: 11.0, yM: 22.0 });

        // Moving the crane dynamically updates the footprint
        node.craneCentreXM = 20.0;
        node.craneCentreYM = 30.0;
        const updatedFp = node.getFootprint();
        expect(updatedFp.pads.frontLeft).toEqual({ xM: 24.0, yM: 33.0 });
        expect(updatedFp.pads.rearRight).toEqual({ xM: 16.0, yM: 27.0 });
    });

    // -------------------------------------------------------------------------
    // Test 4: generateShape creates full 3D assembly including pads and beams
    // -------------------------------------------------------------------------
    test("generateShape creates 3D chassis, boom, 4 outrigger pads, and 2 beams", () => {
        const doc = createMockDocument();
        const node = new MobileCraneBodyNode({
            document: doc,
            craneCentreXM: 0,
            craneCentreYM: 0,
            outriggerLengthSpreadM: 8.0,
            outriggerWidthSpreadM: 6.0,
            padAreaM2: 1.0,
        });

        const createdBoxes: Array<{ dx: number; dy: number; dz: number }> = [];
        const createdCylinders: Array<{ radius: number; height: number }> = [];

        const mockShape = {} as IShape;
        const mockFactory: IShapeFactory = {
            box(_plane: Plane, dx: number, dy: number, dz: number): Result<IShape> {
                createdBoxes.push({ dx, dy, dz });
                return { isOk: true, isErr: false, value: mockShape } as Result<IShape>;
            },
            cylinder(_dir: XYZ, _origin: XYZ, radius: number, height: number): Result<IShape> {
                createdCylinders.push({ radius, height });
                return { isOk: true, isErr: false, value: mockShape } as Result<IShape>;
            },
            combine(_shapes: IShape[]): Result<IShape> {
                return { isOk: true, isErr: false, value: mockShape } as Result<IShape>;
            },
        } as unknown as IShapeFactory;

        const result = node.generateShape(mockFactory);
        expect(result.isOk).toBe(true);

        // Should create:
        // 1 Chassis box (15000 x 3000 x 2500 mm)
        // 1 Boom cylinder (radius 500, height 38000 mm)
        // 4 Pad boxes (1000 x 1000 x 100 mm)
        // 2 Outrigger beams (300 x 6000 x 400 mm)
        // Total boxes = 1 chassis + 4 pads + 2 beams = 7 boxes
        expect(createdBoxes).toHaveLength(7);
        expect(createdCylinders).toHaveLength(1);

        // Chassis box
        expect(createdBoxes[0]).toEqual({ dx: 15000, dy: 3000, dz: 2500 });

        // Boom cylinder
        expect(createdCylinders[0]).toEqual({ radius: 500, height: 38000 });

        // 4 Pad plates (1000 x 1000 x 100 mm)
        for (let i = 1; i <= 4; i++) {
            expect(createdBoxes[i]).toEqual({ dx: 1000, dy: 1000, dz: 100 });
        }

        // 2 Outrigger beams spanning width 6000 mm
        expect(createdBoxes[5]).toEqual({ dx: 300, dy: 6000, dz: 400 });
        expect(createdBoxes[6]).toEqual({ dx: 300, dy: 6000, dz: 400 });
    });

    // -------------------------------------------------------------------------
    // Test 5: MobileCranePlacementPanel syncs outrigger spread inputs to 3D node
    // -------------------------------------------------------------------------
    test("MobileCranePlacementPanel syncs outrigger spreads to the 3D marker node", () => {
        const doc = createMockDocument();
        const mockView = {
            document: doc,
        } as unknown as IView;

        const panel = new MobileCranePlacementPanel(mockView);
        const marker = panel.getMarkerNode();
        expect(marker).toBeDefined();

        if (marker) {
            expect(marker.outriggerLengthSpreadM).toBe(7.7);
            expect(marker.outriggerWidthSpreadM).toBe(7.2);

            // Simulate user modifying outrigger inputs
            const internalPanel = panel as unknown as {
                outriggerLInput: HTMLInputElement;
                outriggerWInput: HTMLInputElement;
            };
            internalPanel.outriggerLInput.value = "8.5";
            internalPanel.outriggerLInput.dispatchEvent(new Event("input"));

            internalPanel.outriggerWInput.value = "7.0";
            internalPanel.outriggerWInput.dispatchEvent(new Event("input"));

            expect(marker.outriggerLengthSpreadM).toBe(8.5);
            expect(marker.outriggerWidthSpreadM).toBe(7.0);

            const fp = marker.getFootprint();
            expect(fp.lengthSpreadM).toBe(8.5);
            expect(fp.widthSpreadM).toBe(7.0);
        }

        panel.dispose();
    });

    // -------------------------------------------------------------------------
    // Test 6: Planning aid disclaimer verification
    // -------------------------------------------------------------------------
    test("always displays the required planning disclaimer", () => {
        expect(PLANNING_DISCLAIMER).toBe("Planning aid, not a certified lift plan.");
    });
});
