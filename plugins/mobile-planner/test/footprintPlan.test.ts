// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Task M3: Outrigger Footprint Polygon on Plan (CI-2 Acceptance Tests)
// Owner: Sujal
// ============================================================================

import { type IShape, type IShapeFactory, type IView, type Plane, Result, type XYZ } from "@chili3d/core";
import { createMockDocument } from "@chili3d/core/test-utils";
import { ShapeFactory } from "@chili3d/wasm";
import { MobileCraneBodyNode } from "../src/body/mobileCraneBody";
import { PLANNING_DISCLAIMER } from "../src/modules/outriggers";
import { MobileCranePlacementPanel } from "../src/ui/mobilePlacementPanel";
import "./setup";

/**
 * Shoelace formula for signed area of a 2D polygon.
 * Positive signed area indicates counter-clockwise (CCW) winding in standard Cartesian (X, Y) coordinates.
 * Area = 0.5 * sum_{i=0}^{n-1} (x_i * y_{i+1} - x_{i+1} * y_i).
 */
function calculateSignedArea(points: ReadonlyArray<{ readonly xM: number; readonly yM: number }>): number {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].xM * points[j].yM;
        area -= points[j].xM * points[i].yM;
    }
    return area / 2;
}

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
    //   FL = (+3.85, +3.60) m  [Quadrant 1]
    //   RL = (-3.85, +3.60) m  [Quadrant 2]
    //   RR = (-3.85, -3.60) m  [Quadrant 3]
    //   FR = (+3.85, -3.60) m  [Quadrant 4]
    //   Polygon: CCW [FL, RL, RR, FR]
    //   Signed Area (Shoelace formula):
    //     (3.85)(3.60) - (-3.85)(3.60) = 13.86 - (-13.86) = +27.72
    //     (-3.85)(-3.60) - (-3.85)(3.60) = 13.86 - (-13.86) = +27.72
    //     (-3.85)(-3.60) - (3.85)(-3.60) = 13.86 - (-13.86) = +27.72
    //     (3.85)(3.60) - (3.85)(-3.60)   = 13.86 - (-13.86) = +27.72
    //     Sum = 110.88 => Signed Area = 110.88 / 2 = +55.44 m² (> 0, counter-clockwise)
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

        // Verify signed area proves counter-clockwise winding (Anjali review finding 1)
        const signedArea = calculateSignedArea(fp.polygon);
        expect(signedArea).toBeCloseTo(7.7 * 7.2, 4);
        expect(signedArea).toBeGreaterThan(0);
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
    //   Signed Area: L * B = 8.0 * 6.0 = +48.0 m² (translation-invariant, CCW)
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

        // Verify signed area is translation-invariant and remains strictly positive CCW
        const signedArea = calculateSignedArea(updatedFp.polygon);
        expect(signedArea).toBeCloseTo(8.0 * 6.0, 4);
        expect(signedArea).toBeGreaterThan(0);
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
        const boxOrigins: Array<{ x: number; y: number; z: number }> = [];
        const createdCylinders: Array<{ radius: number; height: number }> = [];

        const mockShape = {} as IShape;
        const mockFactory: IShapeFactory = {
            box(plane: Plane, dx: number, dy: number, dz: number): Result<IShape> {
                createdBoxes.push({ dx, dy, dz });
                boxOrigins.push({ x: plane.origin.x, y: plane.origin.y, z: plane.origin.z });
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

        // Positions (mm): L = 8 m, B = 6 m, crane at (0, 0), pad side 1000 mm.
        // Pad lower-left corner = pad centre - 500 mm. Order: FL, FR, RL, RR.
        expect(boxOrigins[1]).toEqual({ x: 4000 - 500, y: 3000 - 500, z: 0 });
        expect(boxOrigins[2]).toEqual({ x: 4000 - 500, y: -3000 - 500, z: 0 });
        expect(boxOrigins[3]).toEqual({ x: -4000 - 500, y: 3000 - 500, z: 0 });
        expect(boxOrigins[4]).toEqual({ x: -4000 - 500, y: -3000 - 500, z: 0 });
        // Beams run across the width at the front (x = +4000) and rear (x = -4000) pads.
        expect(boxOrigins[5]).toEqual({ x: 4000 - 150, y: -3000, z: 100 });
        expect(boxOrigins[6]).toEqual({ x: -4000 - 150, y: -3000, z: 100 });
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

    // -------------------------------------------------------------------------
    // Test 7: Fail-safe 3D geometry creation (Anjali review finding 2)
    // Never silently skip failed pads or beams to prevent misleading 3D models.
    // -------------------------------------------------------------------------
    test("generateShape returns Result.err if factory fails to create any pad plate or beam", () => {
        const doc = createMockDocument();
        const node = new MobileCraneBodyNode({
            document: doc,
            craneCentreXM: 0,
            craneCentreYM: 0,
            outriggerLengthSpreadM: 8.0,
            outriggerWidthSpreadM: 6.0,
            padAreaM2: 1.0,
        });

        const mockShape = {} as IShape;

        // 1. Factory that fails when creating the 2nd pad plate (box call index 3)
        let boxCallCount = 0;
        const failingPadFactory: IShapeFactory = {
            box(_plane: Plane, _dx: number, _dy: number, _dz: number): Result<IShape> {
                boxCallCount++;
                // 1 = chassis, 2 = pad 1, 3 = pad 2 (fails!)
                if (boxCallCount === 3) {
                    return Result.err("OCCT pad generation failed");
                }
                return Result.ok(mockShape);
            },
            cylinder(_dir: XYZ, _origin: XYZ, _radius: number, _height: number): Result<IShape> {
                return Result.ok(mockShape);
            },
            combine(_shapes: IShape[]): Result<IShape> {
                return Result.ok(mockShape);
            },
        } as unknown as IShapeFactory;

        const padFailResult = node.generateShape(failingPadFactory);
        expect(padFailResult.isOk).toBe(false);
        expect(padFailResult.error).toContain("pad");

        // 2. Factory that fails when creating the front beam (box call index 6: 1 chassis + 4 pads + front beam)
        boxCallCount = 0;
        const failingBeamFactory: IShapeFactory = {
            box(_plane: Plane, _dx: number, _dy: number, _dz: number): Result<IShape> {
                boxCallCount++;
                if (boxCallCount === 6) {
                    return Result.err("OCCT front beam generation failed");
                }
                return Result.ok(mockShape);
            },
            cylinder(_dir: XYZ, _origin: XYZ, _radius: number, _height: number): Result<IShape> {
                return Result.ok(mockShape);
            },
            combine(_shapes: IShape[]): Result<IShape> {
                return Result.ok(mockShape);
            },
        } as unknown as IShapeFactory;

        const beamFailResult = node.generateShape(failingBeamFactory);
        expect(beamFailResult.isOk).toBe(false);
        expect(beamFailResult.error).toContain("beam");
    });

    // -------------------------------------------------------------------------
    // Test 8: Real OpenCASCADE CAD assembly generation (Anjali verification point 3)
    // -------------------------------------------------------------------------
    test("generateShape creates real OpenCASCADE B-Rep compound solid via WASM ShapeFactory", () => {
        const doc = createMockDocument();
        const node = new MobileCraneBodyNode({
            document: doc,
            craneCentreXM: 10,
            craneCentreYM: 20,
            outriggerLengthSpreadM: 8.0,
            outriggerWidthSpreadM: 6.0,
            padAreaM2: 1.0,
            boomLengthM: 38.0,
            boomAngleDeg: 60.0,
        });

        const realFactory = new ShapeFactory();
        const result = node.generateShape(realFactory);
        expect(result.isOk).toBe(true);

        const compoundShape = result.value;
        expect(compoundShape).toBeDefined();

        const bbox = compoundShape.boundingBox();
        // Crane at (10, 20) m = (10000, 20000) mm.
        // Pad centres:
        //   FL: (10 + 4, 20 + 3) = (14, 23) m = (14000, 23000) mm
        //   FR: (10 + 4, 20 - 3) = (14, 17) m = (14000, 17000) mm
        //   RL: (10 - 4, 20 + 3) = (6, 23) m = (6000, 23000) mm
        //   RR: (10 - 4, 20 - 3) = (6, 17) m = (6000, 17000) mm
        // Pad size = 1000 x 1000 mm => X spans [6000 - 500, 14000 + 500] = [5500, 14500] mm
        // Y spans [17000 - 500, 23000 + 500] = [16500, 23500] mm
        // Y spans exactly [16500, 23500] mm: only the outer pad edges reach it (chassis is 3 m wide,
        // the boom is at slew 0 so it stays near y = 20000).
        // X starts at the chassis rear end: 10000 - 7500 = 2500 mm (the chassis is wider than the pads).
        // Z spans from 0 (ground pad bottom) up to the boom tip:
        //   pivot height 2500 mm (chassis top) + 38000 * sin(60 deg) + 500 * cos(60 deg)
        //   = 2500 + 32908.65 + 250 = 35658.65 mm.
        //   (500 mm = boom radius; the rim of the flat end is the highest point.)
        expect(bbox.min.x).toBeCloseTo(2500, 0);
        expect(bbox.min.y).toBeCloseTo(16500, 0);
        expect(bbox.max.y).toBeCloseTo(23500, 0);
        expect(bbox.min.z).toBeCloseTo(0, 0); // pads rest flush on the ground
        expect(bbox.max.z).toBeCloseTo(2500 + 38000 * Math.sin(Math.PI / 3) + 500 * Math.cos(Math.PI / 3), 0);
        compoundShape.dispose();
    });
});
