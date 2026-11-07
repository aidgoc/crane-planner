// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CraneDimension } from "./cranePlacement";
import type { SiteBuilding } from "./oversailTypes";

export type HeightStatus = "pass" | "fail" | "tie_in_required" | "unavailable";

export type HeightCheckKind = "hook_height" | "freestanding" | "tie_in";

export interface HeightParameters {
    readonly hookHeight: CraneDimension;
    readonly hookClearance: CraneDimension;
    readonly freestandingHeight: CraneDimension;
    readonly tieInSpacing: CraneDimension;
}

export interface HeightCheckInputs {
    readonly buildings: readonly SiteBuilding[];
    readonly hookHeightM: number;
    readonly hookClearanceM: number;
    readonly freestandingHeightM: number;
    readonly tieInSpacingM: number;
}

export interface HeightCheckResult {
    readonly id: string;
    readonly kind: HeightCheckKind;
    readonly label: string;
    readonly status: HeightStatus;
    readonly message: string;
    readonly requiredM?: number;
    readonly availableM?: number;
}

export interface HeightCheckReport {
    readonly valid: boolean;
    readonly errors: readonly string[];
    readonly results: readonly HeightCheckResult[];
    readonly overallStatus: HeightStatus;
    readonly controllingBuilding?: SiteBuilding;
    readonly buildingHeightM?: number;
    readonly requiredHookHeightM?: number;
    readonly providedHookHeightM?: number;
    readonly freestandingHeightM?: number;
    readonly tieInRequired: boolean;
    readonly tieInLevelsM: readonly number[];
}
