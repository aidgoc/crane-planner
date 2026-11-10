// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 — Parametric 3D Mobile Crane Marker Node
// Owner: Ajit
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

const MM_PER_M = 1000;

export interface MobileCraneBodyOptions {
    document: IDocument;
    name?: string;
    craneCentreXM?: number;
    craneCentreYM?: number;
    slewAngleDeg?: number;
    boomLengthM?: number;
    boomAngleDeg?: number;
}

/**
 * Parametric 3D node representing a mobile crane marker on the site plan.
 * Renders carrier chassis, cabin/slew deck, and telescoping boom in 3D.
 * Updates dynamically as the crane position and boom angles change in the M8 panel.
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

    constructor(options: MobileCraneBodyOptions) {
        super({ document: options.document, name: options.name ?? KIT.name });
        this.setPrivateValue("craneCentreXM", options.craneCentreXM ?? 0);
        this.setPrivateValue("craneCentreYM", options.craneCentreYM ?? 0);
        this.setPrivateValue("slewAngleDeg", options.slewAngleDeg ?? 0);
        this.setPrivateValue("boomLengthM", options.boomLengthM ?? 38);
        this.setPrivateValue("boomAngleDeg", options.boomAngleDeg ?? 60);
    }

    generateShape(): Result<IShape> {
        let factory: IShapeFactory | undefined;
        try {
            factory = (globalThis as unknown as { shapeFactory?: IShapeFactory }).shapeFactory;
        } catch {
            // Safely guard if no application instance is set in headless tests
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

        const boomRadiusMm = 0.5 * MM_PER_M; // INDICATIVE: 0.5 m radius boom cylinder for marker visualization
        const boomLengthMm = this.boomLengthM * MM_PER_M;

        const boomRes = factory.cylinder(dirXYZ, originXYZ, boomRadiusMm, boomLengthMm);
        if (boomRes.isOk) {
            shapes.push(boomRes.value);
        }

        if (shapes.length === 0) {
            return Result.err("Failed to generate crane geometry");
        }

        return shapes.length === 1 ? Result.ok(shapes[0]) : factory.combine(shapes);
    }
}
