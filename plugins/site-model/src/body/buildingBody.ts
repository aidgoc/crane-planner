// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// S3 — Parametric 3D Building Body Node
// Owner: Ajit
// ============================================================================

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    ParameterShapeNode,
    property,
    type Result,
    serializable,
    serialize,
} from "@chili3d/core";
import type { ShapeFactory } from "@chili3d/wasm";
import { extrudeBuildingSolid } from "../extrusion";
import type { Point2D } from "../types";

export interface BuildingBodyNodeOptions {
    document: IDocument;
    name?: string;
    label?: string;
    polygon: Point2D[];
    heightM: number;
}

/**
 * Parametric 3D solid body representing an extruded building on the site.
 * Can be added to Chili3D's ModelManager so that buildings appear in the
 * project tree and are rendered in the Three.js viewport.
 */
@serializable()
export class BuildingBodyNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "site.model.building" as I18nKeys;
    }

    @serialize()
    @property("site.model.buildingLabel" as I18nKeys)
    get label(): string {
        return this.getPrivateValue("label");
    }
    set label(value: string) {
        this.setPropertyEmitShapeChanged("label", value);
    }

    @serialize()
    @property("site.model.height" as I18nKeys)
    get heightM(): number {
        return this.getPrivateValue("heightM");
    }
    set heightM(value: number) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`Height must be a positive number: got ${value}`);
        }
        this.setPropertyEmitShapeChanged("heightM", value);
    }

    @serialize()
    get polygon(): Point2D[] {
        return this.getPrivateValue("polygon");
    }
    set polygon(value: Point2D[]) {
        if (!value || value.length < 3) {
            throw new Error("Footprint polygon must have at least 3 points");
        }
        this.setPropertyEmitShapeChanged("polygon", value);
    }

    constructor(options: BuildingBodyNodeOptions) {
        super(options);
        this.setPrivateValue("label", options.label ?? options.name ?? "Building");
        this.setPrivateValue("heightM", options.heightM);
        this.setPrivateValue("polygon", options.polygon);
    }

    generateShape(): Result<IShape> {
        // shapeFactory is globally initialized in Chili3D when WASM is ready.
        // Fall back safely if shapeFactory is not available in mock/headless unit environments.
        const factory = (globalThis as unknown as { shapeFactory?: ShapeFactory }).shapeFactory;
        if (!factory) {
            return {
                isOk: false,
                error: "ShapeFactory is not initialized",
            } as Result<IShape>;
        }
        return extrudeBuildingSolid(factory, this.polygon, this.heightM);
    }
}
