// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { checkCirclePolygonOversail, checkLineClearance } from "../geometry/clearance";
import {
    checkBoundaryOversail,
    checkCircleOverlap,
    checkHorizontalBandOversail,
} from "../geometry/oversailGeometry";
import type { OversailCheckResult, OversailInputs, OversailReport, OversailStatus } from "./oversailTypes";

const EPS = 1e-9;

export function formatMetres(value: number): string {
    const normalized = Math.abs(value) < 0.05 ? 0 : value;
    return normalized.toFixed(1);
}

function overallStatus(results: readonly OversailCheckResult[]): OversailStatus {
    if (results.some((result) => result.status === "fail")) return "fail";
    if (results.some((result) => result.status === "permission_needed")) return "permission_needed";
    return "pass";
}

function powerLineNote(sourceNote: string, indicative: boolean): string {
    if (!indicative) return sourceNote;
    return /indicat/i.test(sourceNote) ? sourceNote : `INDICATIVE — ${sourceNote}`;
}

export function evaluateOversailChecks(inputs: OversailInputs): OversailReport {
    const { mast, swingRadiusM, site } = inputs;
    const results: OversailCheckResult[] = [];

    const boundary = checkBoundaryOversail(mast, swingRadiusM, site.boundary.polygon);
    if (!boundary.mastInside) {
        results.push({
            id: "boundary",
            kind: "boundary",
            label: "Site boundary",
            status: "fail",
            oversailDepthM: boundary.oversailDepth,
            message: `Mast is outside the site boundary; jib envelope reaches ${formatMetres(
                boundary.oversailDepth,
            )} m into the plot.`,
            source: site.boundary.source,
        });
    } else if (boundary.oversailDepth > EPS) {
        results.push({
            id: "boundary",
            kind: "boundary",
            label: "Site boundary",
            status: "fail",
            oversailDepthM: boundary.oversailDepth,
            message: `Jib oversails site boundary by ${formatMetres(
                boundary.oversailDepth,
            )} m (planning constraint; no boundary oversail rule supplied).`,
            source: site.boundary.source,
        });
    } else {
        results.push({
            id: "boundary",
            kind: "boundary",
            label: "Site boundary",
            status: "pass",
            oversailDepthM: 0,
            message: "No oversail of site boundary.",
            source: site.boundary.source,
        });
    }

    if (site.road) {
        const road = checkHorizontalBandOversail(mast, swingRadiusM, site.road.yFromM, site.road.yToM);
        results.push({
            id: "road",
            kind: "road",
            label: "Road",
            status: road.oversailDepth > EPS ? "fail" : "pass",
            oversailDepthM: road.oversailDepth,
            message:
                road.oversailDepth > EPS
                    ? `Jib oversails road by ${formatMetres(road.oversailDepth)} m (${site.road.rule}).`
                    : `No oversail of road (${site.road.rule}).`,
            source: site.road.source,
        });
    }

    if (site.powerLine) {
        const requiredM = swingRadiusM + site.powerLine.clearanceM;
        const clearance = checkLineClearance(mast, { type: "vertical", x: site.powerLine.xM }, requiredM);
        const note = powerLineNote(site.powerLine.sourceNote, site.powerLine.indicative);
        const voltage = site.powerLine.voltageKv === undefined ? "" : ` ${site.powerLine.voltageKv} kV`;
        results.push({
            id: "power_line",
            kind: "power_line",
            label: `Power line${voltage}`,
            status: clearance.violation > EPS ? "fail" : "pass",
            oversailDepthM: clearance.violation,
            requiredM,
            availableM: clearance.available,
            source: note,
            message:
                clearance.violation > EPS
                    ? `Power line clearance short by ${formatMetres(
                          clearance.violation,
                      )} m (${formatMetres(clearance.available)} m available, ${formatMetres(
                          requiredM,
                      )} m required: ${formatMetres(swingRadiusM)} m jib + ${formatMetres(
                          site.powerLine.clearanceM,
                      )} m clearance). ${note}`
                    : `Power-line clearance OK (${formatMetres(
                          clearance.available,
                      )} m available, ${formatMetres(requiredM)} m required). ${note}`,
        });
    }

    for (const neighbour of site.neighbours) {
        const check = checkCirclePolygonOversail(mast, swingRadiusM, neighbour.polygon);
        if (check.oversailDepth > EPS) {
            const status: OversailStatus = neighbour.rule === "no_oversail" ? "fail" : "permission_needed";
            const suffix =
                neighbour.rule === "no_oversail" ? ", no oversail permitted" : "; permission needed";
            results.push({
                id: `neighbour:${neighbour.id}`,
                kind: "neighbour",
                label: `Neighbour ${neighbour.displayName}`,
                status,
                oversailDepthM: check.oversailDepth,
                message: `Jib oversails ${neighbour.displayName} by ${formatMetres(
                    check.oversailDepth,
                )} m${suffix}.`,
                source: neighbour.label,
            });
        } else {
            results.push({
                id: `neighbour:${neighbour.id}`,
                kind: "neighbour",
                label: `Neighbour ${neighbour.displayName}`,
                status: "pass",
                oversailDepthM: 0,
                message: `No oversail of ${neighbour.displayName}.`,
                source: neighbour.label,
            });
        }
    }

    for (const zone of site.noGoZones) {
        const check = checkCircleOverlap(mast, swingRadiusM, zone.center, zone.radiusM);
        results.push({
            id: `no_go:${zone.id}`,
            kind: "no_go",
            label: `No-go ${zone.label}`,
            status: check.overlapDepth > EPS ? "fail" : "pass",
            oversailDepthM: check.overlapDepth,
            message:
                check.overlapDepth > EPS
                    ? `Jib overlaps no-go zone '${zone.label}' by ${formatMetres(check.overlapDepth)} m.`
                    : `No overlap with no-go zone '${zone.label}'.`,
        });
    }

    return { results, overallStatus: overallStatus(results) };
}
