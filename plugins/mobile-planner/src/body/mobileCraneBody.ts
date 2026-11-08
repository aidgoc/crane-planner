// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 / M3 — Parametric 3D Mobile Crane Marker Node & Outrigger Footprint
// Owners: Ajit (M8 marker), Sujal (M3 footprint on plan)
// ============================================================================

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    type IShapeFactory,
    ParameterShapeNode,
    Plane,
    property,
    Result,
    serializable,
    serialize,
    XYZ,
} from "@chili3d/core";
import { KIT } from "../modules/craneModel";
import { getOutriggerFootprint, type OutriggerFootprint } from "../modules/outriggers";

const MM_PER_M = 1000;

export interface MobileCraneBodyOptions {
    document: IDocument;
    name?: string;
    craneCentreXM?: number;
    craneCentreYM?: number;
    slewAngleDeg?: number;
    boomLengthM?: number;
    boomAngleDeg?: number;
    outriggerLengthSpreadM?: number;
    outriggerWidthSpreadM?: number;
    padAreaM2?: number;
}

/**
 * Parametric 3D node representing a mobile crane marker and outrigger footprint on the site plan.
 * Renders:
 * 1. Carrier chassis box in 3D
 * 2. Telescoping boom cylinder in 3D
 * 3. 4 Outrigger pad plates on the ground (Z = 0) at the 4 footprint corners (FL, FR, RL, RR)
 * 4. Front and rear outrigger extension cross-beams connecting pads across the chassis
 * Updates dynamically as the crane position, boom angles, and outrigger spreads change in the M8 panel.
 */
@serializable()
export class MobileCraneBodyNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "mobile.crane.marker" as I18nKeys;
    }

    @serialize()
    @property("mobile.crane.centreX" as I18nKeys)
    get craneCentreXM(): number {
        return this.getPrivateValue("craneCentreXM");
    }
    set craneCentreXM(value: number) {
        if (!Number.isFinite(value)) throw new Error("craneCentreXM must be finite");
        this.setPropertyEmitShapeChanged("craneCentreXM", value);
    }

    @serialize()
    @property("mobile.crane.centreY" as I18nKeys)
    get craneCentreYM(): number {
        return this.getPrivateValue("craneCentreYM");
    }
    set craneCentreYM(value: number) {
        if (!Number.isFinite(value)) throw new Error("craneCentreYM must be finite");
        this.setPropertyEmitShapeChanged("craneCentreYM", value);
    }

    @serialize()
    @property("mobile.crane.slewAngle" as I18nKeys)
    get slewAngleDeg(): number {
        return this.getPrivateValue("slewAngleDeg");
    }
    set slewAngleDeg(value: number) {
        if (!Number.isFinite(value)) throw new Error("slewAngleDeg must be finite");
        this.setPropertyEmitShapeChanged("slewAngleDeg", value);
    }

    @serialize()
    @property("mobile.crane.boomLength" as I18nKeys)
    get boomLengthM(): number {
        return this.getPrivateValue("boomLengthM");
    }
    set boomLengthM(value: number) {
        if (!Number.isFinite(value) || value <= 0) throw new Error("boomLengthM must be positive");
        this.setPropertyEmitShapeChanged("boomLengthM", value);
    }

    @serialize()
    @property("mobile.crane.boomAngle" as I18nKeys)
    get boomAngleDeg(): number {
        return this.getPrivateValue("boomAngleDeg");
    }
    set boomAngleDeg(value: number) {
        if (!Number.isFinite(value) || value < 0 || value > 90) {
            throw new Error("boomAngleDeg must be between 0 and 90 degrees");
        }
        this.setPropertyEmitShapeChanged("boomAngleDeg", value);
    }

    @serialize()
    @property("mobile.crane.outriggerLength" as I18nKeys)
    get outriggerLengthSpreadM(): number {
        return this.getPrivateValue("outriggerLengthSpreadM");
    }
    set outriggerLengthSpreadM(value: number) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error("outriggerLengthSpreadM must be strictly positive");
        }
        this.setPropertyEmitShapeChanged("outriggerLengthSpreadM", value);
    }

    @serialize()
    @property("mobile.crane.outriggerWidth" as I18nKeys)
    get outriggerWidthSpreadM(): number {
        return this.getPrivateValue("outriggerWidthSpreadM");
    }
    set outriggerWidthSpreadM(value: number) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error("outriggerWidthSpreadM must be strictly positive");
        }
        this.setPropertyEmitShapeChanged("outriggerWidthSpreadM", value);
    }

    @serialize()
    @property("mobile.crane.padArea" as I18nKeys)
    get padAreaM2(): number {
        return this.getPrivateValue("padAreaM2");
    }
    set padAreaM2(value: number) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error("padAreaM2 must be strictly positive");
        }
        this.setPropertyEmitShapeChanged("padAreaM2", value);
    }

    constructor(options: MobileCraneBodyOptions) {
        super({ document: options.document, name: options.name ?? KIT.name });
        this.setPrivateValue("craneCentreXM", options.craneCentreXM ?? 0);
        this.setPrivateValue("craneCentreYM", options.craneCentreYM ?? 0);
        this.setPrivateValue("slewAngleDeg", options.slewAngleDeg ?? 0);
        this.setPrivateValue("boomLengthM", options.boomLengthM ?? 38);
        this.setPrivateValue("boomAngleDeg", options.boomAngleDeg ?? 60);
        // Defaults below are INDICATIVE (same as placementState); the panel always passes its own values.
        this.setPrivateValue("outriggerLengthSpreadM", options.outriggerLengthSpreadM ?? 7.7);
        this.setPrivateValue("outriggerWidthSpreadM", options.outriggerWidthSpreadM ?? 7.2);
        this.setPrivateValue("padAreaM2", options.padAreaM2 ?? 1.0);
    }

    /**
     * Returns the 2D outrigger footprint polygon and pad coordinates on the site plan (Task M3).
     * Follows the crane position (craneCentreXM, craneCentreYM) faithfully.
     */
    getFootprint(): OutriggerFootprint {
        return getOutriggerFootprint({
            lengthSpreadM: this.outriggerLengthSpreadM,
            widthSpreadM: this.outriggerWidthSpreadM,
            center: { xM: this.craneCentreXM, yM: this.craneCentreYM },
        });
    }

    override generateShape(customFactory?: IShapeFactory): Result<IShape> {
        let factory = customFactory;
        if (!factory) {
            try {
                factory = (globalThis as unknown as { shapeFactory?: IShapeFactory }).shapeFactory;
            } catch {
                // Safely guard if no application instance is set in headless tests
            }
        }
        if (!factory) {
            return Result.err("ShapeFactory is not initialized");
        }

        const cxMm = this.craneCentreXM * MM_PER_M;
        const cyMm = this.craneCentreYM * MM_PER_M;
        const slewRad = (this.slewAngleDeg * Math.PI) / 180;
        const elevRad = (this.boomAngleDeg * Math.PI) / 180;

        // Carrier box dimensions (INDICATIVE: 15 m long, 3 m wide, 2.5 m high)
        const carrierLengthMm = 15 * MM_PER_M;
        const carrierWidthMm = 3 * MM_PER_M;
        const carrierHeightMm = 2.5 * MM_PER_M;

        const shapes: IShape[] = [];

        // 1. Carrier Chassis Box centered horizontally at crane position
        const chassisPlane = Plane.XY.translateTo(
            new XYZ({
                x: cxMm - carrierLengthMm / 2,
                y: cyMm - carrierWidthMm / 2,
                z: 0,
            }),
        );
        const chassisRes = factory.box(chassisPlane, carrierLengthMm, carrierWidthMm, carrierHeightMm);
        if (chassisRes.isOk) {
            shapes.push(chassisRes.value);
        }

        // 2. Telescoping Boom Cylinder starting at pivot
        const pivotXMm = cxMm + KIT.PIVOT_OFFSET_M * Math.cos(slewRad) * MM_PER_M;
        const pivotYMm = cyMm + KIT.PIVOT_OFFSET_M * Math.sin(slewRad) * MM_PER_M;
        const pivotZMm = carrierHeightMm; // Slew deck height

        const dirX = Math.cos(slewRad) * Math.cos(elevRad);
        const dirY = Math.sin(slewRad) * Math.cos(elevRad);
        const dirZ = Math.sin(elevRad);
        const dirXYZ = new XYZ({ x: dirX, y: dirY, z: dirZ });
        const originXYZ = new XYZ({ x: pivotXMm, y: pivotYMm, z: pivotZMm });

        const boomRadiusMm = 0.5 * MM_PER_M; // 0.5 m radius boom cylinder
        const boomLengthMm = this.boomLengthM * MM_PER_M;

        const boomRes = factory.cylinder(dirXYZ, originXYZ, boomRadiusMm, boomLengthMm);
        if (boomRes.isOk) {
            shapes.push(boomRes.value);
        }

        // 3. Outrigger Beams and Pads on Plan (M3 Footprint on Plan)
        // Pad dimensions: square plate of side sqrt(padArea), default 1.0 m, thickness 0.1 m (100 mm) resting on ground (z = 0..100)
        const padSideMm = Math.sqrt(this.padAreaM2) * MM_PER_M;
        const padThicknessMm = 0.1 * MM_PER_M;
        const beamThicknessMm = 0.3 * MM_PER_M; // 300 mm cross section
        const beamHeightMm = 0.4 * MM_PER_M; // 400 mm height
        const beamZMm = padThicknessMm; // beam resting on top of pad plate (z = 100..500)

        // Pad positions come from getFootprint(), so the drawn pads and the M3 polygon
        // can not drift apart.
        const footprint = this.getFootprint();
        const toMm = (p: { xM: number; yM: number }) => ({ x: p.xM * MM_PER_M, y: p.yM * MM_PER_M });
        const fl = toMm(footprint.pads.frontLeft);
        const fr = toMm(footprint.pads.frontRight);
        const rl = toMm(footprint.pads.rearLeft);
        const rr = toMm(footprint.pads.rearRight);

        // 3.1 4 Outrigger Pad Plates on ground (Z = 0)
        const padCenters = [fl, fr, rl, rr];

        for (const pad of padCenters) {
            const padPlane = Plane.XY.translateTo(
                new XYZ({
                    x: pad.x - padSideMm / 2,
                    y: pad.y - padSideMm / 2,
                    z: 0,
                }),
            );
            const padRes = factory.box(padPlane, padSideMm, padSideMm, padThicknessMm);
            if (padRes.isOk) {
                shapes.push(padRes.value);
            }
        }

        // 3.2 Front and Rear Transverse Outrigger Beams connecting pads across chassis
        // Front beam at X = cxMm + halfLMm
        const frontBeamPlane = Plane.XY.translateTo(
            new XYZ({
                x: fl.x - beamThicknessMm / 2,
                y: fr.y,
                z: beamZMm,
            }),
        );
        const frontBeamRes = factory.box(
            frontBeamPlane,
            beamThicknessMm,
            this.outriggerWidthSpreadM * MM_PER_M,
            beamHeightMm,
        );
        if (frontBeamRes.isOk) {
            shapes.push(frontBeamRes.value);
        }

        // Rear beam at X = cxMm - halfLMm
        const rearBeamPlane = Plane.XY.translateTo(
            new XYZ({
                x: rl.x - beamThicknessMm / 2,
                y: rr.y,
                z: beamZMm,
            }),
        );
        const rearBeamRes = factory.box(
            rearBeamPlane,
            beamThicknessMm,
            this.outriggerWidthSpreadM * MM_PER_M,
            beamHeightMm,
        );
        if (rearBeamRes.isOk) {
            shapes.push(rearBeamRes.value);
        }

        if (shapes.length === 0) {
            return Result.err("Failed to generate crane geometry");
        }

        return shapes.length === 1 ? Result.ok(shapes[0]) : factory.combine(shapes);
    }
}
