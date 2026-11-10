// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Point2D, Polygon2D } from "../geometry";

export type OversailStatus = "pass" | "fail" | "permission_needed";

export type OversailCheckKind = "boundary" | "road" | "power_line" | "neighbour" | "no_go";

export interface OversailNeighbour {
    readonly id: string;
    readonly label: string;
    readonly displayName: string;
    readonly polygon: Polygon2D;
    readonly rule: "no_oversail" | "oversail_by_permission";
}

export interface OversailNoGoZone {
    readonly id: string;
    readonly label: string;
    readonly center: Point2D;
    readonly radiusM: number;
}

export interface OversailRoad {
    readonly yFromM: number;
    readonly yToM: number;
    readonly rule: string;
    readonly source?: string;
}

export interface OversailPowerLine {
    readonly xM: number;
    readonly clearanceM: number;
    readonly voltageKv?: number;
    readonly sourceNote: string;
    readonly indicative: boolean;
}

export interface OversailBoundary {
    readonly polygon: Polygon2D;
    readonly source: string;
}

export interface SiteBuilding {
    readonly id: string;
    readonly label: string;
    readonly heightM?: number;
}

export interface OversailSite {
    readonly boundary: OversailBoundary;
    readonly neighbours: readonly OversailNeighbour[];
    readonly noGoZones: readonly OversailNoGoZone[];
    readonly buildings?: readonly SiteBuilding[];
    readonly road?: OversailRoad;
    readonly powerLine?: OversailPowerLine;
}

export interface OversailInputs {
    readonly mast: Point2D;
    readonly swingRadiusM: number;
    readonly site: OversailSite;
}

export interface OversailCheckResult {
    readonly id: string;
    readonly kind: OversailCheckKind;
    readonly label: string;
    readonly status: OversailStatus;
    readonly oversailDepthM: number;
    readonly message: string;
    readonly source?: string;
    readonly requiredM?: number;
    readonly availableM?: number;
}

export interface OversailReport {
    readonly results: readonly OversailCheckResult[];
    readonly overallStatus: OversailStatus;
}
