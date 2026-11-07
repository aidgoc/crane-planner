// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CraneDimension } from "./cranePlacement";
import type {
    HeightCheckInputs,
    HeightCheckReport,
    HeightCheckResult,
    HeightParameters,
    HeightStatus,
} from "./heightTypes";
import type { SiteBuilding } from "./oversailTypes";

const EPS = 1e-9;

function indicative(value: number, note: string): CraneDimension {
    return { value, source: { kind: "indicative", note } };
}

export function createDefaultHeightParameters(): HeightParameters {
    return {
        hookHeight: indicative(
            80,
            "INDICATIVE demo hook height. Replace with the supplied crane configuration.",
        ),
        hookClearance: indicative(
            2,
            "INDICATIVE planning allowance, not a quoted standard. Replace with the project or standard value.",
        ),
        freestandingHeight: indicative(
            50,
            "INDICATIVE demo freestanding height. Replace with the crane supplier's value.",
        ),
        tieInSpacing: indicative(
            20,
            "INDICATIVE tie-in spacing. The crane supplier's tie-in schedule governs.",
        ),
    };
}

export function validateHeightParameters(parameters: HeightParameters): string[] {
    const errors: string[] = [];
    const checkPositive = (label: string, dimension: CraneDimension) => {
        if (!Number.isFinite(dimension.value) || dimension.value <= 0) {
            errors.push(`${label} must be greater than 0 m.`);
        }
    };

    checkPositive("Hook height", parameters.hookHeight);
    checkPositive("Freestanding height", parameters.freestandingHeight);
    checkPositive("Tie-in spacing", parameters.tieInSpacing);
    if (!Number.isFinite(parameters.hookClearance.value) || parameters.hookClearance.value < 0) {
        errors.push("Hook clearance must be 0 m or greater.");
    }

    return errors;
}

function validateInputs(inputs: HeightCheckInputs): string[] {
    const errors: string[] = [];

    if (!Array.isArray(inputs.buildings) || inputs.buildings.length === 0) {
        errors.push(
            "Building height unavailable: no building heights were supplied, so the height check was not performed.",
        );
    } else {
        for (const building of inputs.buildings) {
            if (building.heightM === undefined) {
                errors.push(`Building '${building.label}' has no height.`);
            } else if (!Number.isFinite(building.heightM) || building.heightM <= 0) {
                errors.push(`Building '${building.label}' height must be a finite number greater than 0 m.`);
            }
        }
    }

    if (!Number.isFinite(inputs.hookHeightM) || inputs.hookHeightM <= 0) {
        errors.push("Hook height must be greater than 0 m.");
    }
    if (!Number.isFinite(inputs.hookClearanceM) || inputs.hookClearanceM < 0) {
        errors.push("Hook clearance must be 0 m or greater.");
    }
    if (!Number.isFinite(inputs.freestandingHeightM) || inputs.freestandingHeightM <= 0) {
        errors.push("Freestanding height must be greater than 0 m.");
    }
    if (!Number.isFinite(inputs.tieInSpacingM) || inputs.tieInSpacingM <= 0) {
        errors.push("Tie-in spacing must be greater than 0 m.");
    }

    return errors;
}

export function formatHeight(value: number): string {
    const normalized = Math.abs(value) < 0.05 ? 0 : value;
    return normalized.toFixed(1);
}

export function tieInLevels(
    requiredHookHeightM: number,
    freestandingHeightM: number,
    tieInSpacingM: number,
): number[] {
    if (
        !Number.isFinite(requiredHookHeightM) ||
        !Number.isFinite(freestandingHeightM) ||
        !Number.isFinite(tieInSpacingM) ||
        tieInSpacingM <= 0 ||
        requiredHookHeightM <= freestandingHeightM
    ) {
        return [];
    }

    // Start at the freestanding limit, then repeat every spacing until the
    // required hook height is covered. Each tie-in is assumed to extend the
    // supported height by one spacing; the supplier's schedule governs.
    const count = Math.max(1, Math.ceil((requiredHookHeightM - freestandingHeightM) / tieInSpacingM - EPS));
    return Array.from({ length: count }, (_, index) =>
        Number((freestandingHeightM + index * tieInSpacingM).toFixed(3)),
    );
}

function overallStatus(results: readonly HeightCheckResult[]): HeightStatus {
    if (results.some((result) => result.status === "fail")) return "fail";
    if (results.some((result) => result.status === "tie_in_required")) return "tie_in_required";
    return "pass";
}

function unavailableReport(errors: string[]): HeightCheckReport {
    return {
        valid: false,
        errors,
        results: [],
        overallStatus: "unavailable",
        tieInRequired: false,
        tieInLevelsM: [],
    };
}

export function evaluateHeightChecks(inputs: HeightCheckInputs): HeightCheckReport {
    const errors = validateInputs(inputs);
    if (errors.length > 0) return unavailableReport(errors);

    const buildings = inputs.buildings as readonly (SiteBuilding & { heightM: number })[];
    const controllingBuilding = buildings.reduce((tallest, building) =>
        building.heightM > tallest.heightM ? building : tallest,
    );
    const buildingHeightM = controllingBuilding.heightM;
    const requiredHookHeightM = buildingHeightM + inputs.hookClearanceM;
    const providedHookHeightM = inputs.hookHeightM;
    const freestandingHeightM = inputs.freestandingHeightM;
    const levels = tieInLevels(requiredHookHeightM, freestandingHeightM, inputs.tieInSpacingM);
    const tieInRequired = levels.length > 0;
    const results: HeightCheckResult[] = [];

    const hookShortfallM = requiredHookHeightM - providedHookHeightM;
    const heightBasis = `${controllingBuilding.label} ${formatHeight(
        buildingHeightM,
    )} m + ${formatHeight(inputs.hookClearanceM)} m clearance; individual building heights are not summed`;
    results.push({
        id: "hook_height",
        kind: "hook_height",
        label: "Hook height",
        status: hookShortfallM > EPS ? "fail" : "pass",
        requiredM: requiredHookHeightM,
        availableM: providedHookHeightM,
        message:
            hookShortfallM > EPS
                ? `Hook height short by ${formatHeight(
                      hookShortfallM,
                  )} m: ${formatHeight(providedHookHeightM)} m available, ${formatHeight(
                      requiredHookHeightM,
                  )} m required (${heightBasis}).`
                : `Hook height OK: ${formatHeight(providedHookHeightM)} m available, ${formatHeight(
                      requiredHookHeightM,
                  )} m required (${heightBasis}).`,
    });

    results.push({
        id: "freestanding",
        kind: "freestanding",
        label: "Freestanding height",
        status: tieInRequired ? "tie_in_required" : "pass",
        requiredM: requiredHookHeightM,
        availableM: freestandingHeightM,
        message: tieInRequired
            ? `Tie-in required: freestanding height ${formatHeight(
                  freestandingHeightM,
              )} m is below the required ${formatHeight(requiredHookHeightM)} m hook height.`
            : `Freestanding height OK: ${formatHeight(
                  freestandingHeightM,
              )} m covers the required ${formatHeight(requiredHookHeightM)} m hook height.`,
    });

    results.push({
        id: "tie_in",
        kind: "tie_in",
        label: "Tie-in levels",
        status: tieInRequired ? "tie_in_required" : "pass",
        message: tieInRequired
            ? `Tie-in required at ${levels.length} level(s): ${levels
                  .map((level) => formatHeight(level))
                  .join(", ")} m above ground (INDICATIVE ${formatHeight(
                  inputs.tieInSpacingM,
              )} m spacing; the crane supplier's schedule governs).`
            : "No tie-in levels required; the freestanding height covers the required hook height.",
    });

    return {
        valid: true,
        errors: [],
        results,
        overallStatus: overallStatus(results),
        controllingBuilding,
        buildingHeightM,
        requiredHookHeightM,
        providedHookHeightM,
        freestandingHeightM,
        tieInRequired,
        tieInLevelsM: levels,
    };
}
