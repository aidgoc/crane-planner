// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M6 + M7 — 3D boom clearance and swing sweep section for the placement panel
// Owner: Abhishek
//
// A separate UI class so that the panel (M8) only needs a small hook. It shows
//  - M6: the 3D minimum distance from the boom to every obstacle (red under the limit)
//  - M7: the worst distance and its slew angle over a swing from a pick angle to a set angle
// The numbers come from computeSiteClearance (M6) and sweepSlew (M7); nothing is computed here.
// ============================================================================

import type { IShapeFactory } from "@chili3d/core";
import { div, input, span } from "@chili3d/element";
import {
    type BoomPlacement,
    computeSiteClearance,
    type ObstacleClearanceResult,
    type ObstacleFootprint,
    type PowerLineObstacle,
    type SiteClearanceReport,
} from "../clearance/siteClearance";
import { type SwingSweepReport, sweepSlew } from "../clearance/swingSweep";
import { KIT } from "../modules/craneModel";
import type { SiteObstacle } from "../modules/placementState";
import style from "./mobilePlacementPanel.module.css";

/**
 * Boom shape used for the 3D distance. These are the same values as the crane marker
 * drawn by MobileCraneBodyNode (slew deck 2.5 m high, boom cylinder radius 0.5 m), so the
 * number matches what is on screen. Both are INDICATIVE, not crane data.
 */
export const BOOM_PIVOT_HEIGHT_M = 2.5;
export const BOOM_RADIUS_M = 0.5;

/** Default swing for the sweep: BACKLOG M7 example (pick at 0 deg, set at 90 deg, 2 deg step). */
export const DEFAULT_SWEEP = { fromDeg: 0, toDeg: 90, stepDeg: 2 } as const;

/** The crane inputs this section needs. A subset of MobilePlacementInput. */
export interface Clearance3DInput {
    readonly craneCentreXM: number;
    readonly craneCentreYM: number;
    readonly slewAngleDeg: number;
    readonly boomLengthM: number;
    readonly boomAngleDeg: number;
}

export interface SplitObstacles {
    readonly buildings: ObstacleFootprint[];
    readonly powerLine: PowerLineObstacle | undefined;
    /** Labels of obstacles that cannot be checked in 3D (no polygon + height, no power line). */
    readonly skipped: string[];
}

function fmt(value: number, digits = 2): string {
    const n = Math.abs(value) < 10 ** -digits / 2 ? 0 : value;
    return n.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

function badge(text: string, status: "pass" | "fail" | "warn"): HTMLElement {
    const cls = status === "pass" ? style.badgePass : status === "fail" ? style.badgeFail : style.badgeWarn;
    return span({ className: cls, textContent: text });
}

/** WARNING and CRITICAL are both red, as in statusToColour (M6). */
function statusBadge(status: "SAFE" | "WARNING" | "CRITICAL" | null): HTMLElement {
    if (status === null) return badge("NOT CHECKED", "warn");
    return badge(status, status === "SAFE" ? "pass" : "fail");
}

/** The id an obstacle gets in the M6 check: its position in the panel's obstacle list. */
export function obstacleId(index: number): string {
    return `obstacle-${index}`;
}

/**
 * Turns the panel's obstacles into the M6 inputs. A polygon with a height becomes a building;
 * an xLineM becomes the power line (only one power line is supported by M6, the first one is
 * used and the others are listed as skipped, so none is dropped silently).
 */
export function splitObstacles(obstacles: readonly SiteObstacle[]): SplitObstacles {
    const buildings: ObstacleFootprint[] = [];
    let powerLine: PowerLineObstacle | undefined;
    const skipped: string[] = [];
    obstacles.forEach((o, i) => {
        if (o.polygon && o.polygon.length >= 3 && o.heightM !== undefined && o.heightM > 0) {
            buildings.push({
                id: obstacleId(i),
                label: o.label,
                polygon: o.polygon.map((p) => [p[0], p[1]] as [number, number]),
                height_m: o.heightM,
                clearanceLimitM: o.requiredClearanceM,
            });
        } else if (o.xLineM !== undefined && Number.isFinite(o.xLineM)) {
            if (powerLine === undefined) {
                powerLine = {
                    id: obstacleId(i),
                    label: o.label,
                    x_m: o.xLineM,
                    clearanceLimitM: o.requiredClearanceM,
                };
            } else {
                skipped.push(o.label);
            }
        } else {
            skipped.push(o.label);
        }
    });
    return { buildings, powerLine, skipped };
}

/** Boom foot and shape for the 3D check: foot is the crane centre plus the pivot offset along the slew. */
export function toBoomPlacement(input: Clearance3DInput): BoomPlacement {
    const rad = (input.slewAngleDeg * Math.PI) / 180;
    return {
        pivotM: {
            x: input.craneCentreXM + KIT.PIVOT_OFFSET_M * Math.cos(rad),
            y: input.craneCentreYM + KIT.PIVOT_OFFSET_M * Math.sin(rad),
            z: BOOM_PIVOT_HEIGHT_M,
        },
        boomRadiusM: BOOM_RADIUS_M,
        boomLengthM: input.boomLengthM,
        slewDeg: input.slewAngleDeg,
        elevationDeg: input.boomAngleDeg,
    };
}

/**
 * Boom for the swing sweep: the pivot is the slew axis point (crane centre at deck height). sweepSlew
 * adds the 0.8 m foot offset along the slew at each angle (footOffsetM), so the foot moves with the
 * slew like the real boom, and the boom is the same as in the M6 check at every angle.
 */
export function toSweepPlacement(input: Clearance3DInput): BoomPlacement {
    return {
        pivotM: { x: input.craneCentreXM, y: input.craneCentreYM, z: BOOM_PIVOT_HEIGHT_M },
        boomRadiusM: BOOM_RADIUS_M,
        boomLengthM: input.boomLengthM,
        slewDeg: input.slewAngleDeg,
        elevationDeg: input.boomAngleDeg,
    };
}

export interface Clearance3DOptions {
    /** Wait before the M6 check runs after the last input change (ms). 0 runs it at once. */
    readonly debounceMs?: number;
}

export class Clearance3DSection {
    readonly el: HTMLElement;

    private readonly noteEl: HTMLElement;
    private readonly m6Rows: HTMLElement;
    private readonly m7Rows: HTMLElement;
    private readonly fromInput: HTMLInputElement;
    private readonly toInput: HTMLInputElement;
    private readonly stepInput: HTMLInputElement;
    private readonly runButton: HTMLButtonElement;

    private current: Clearance3DInput | undefined;
    private obstacles: readonly SiteObstacle[] = [];
    private timer: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;

    constructor(
        private readonly getFactory: () => IShapeFactory | undefined,
        private readonly options: Clearance3DOptions = {},
    ) {
        this.noteEl = div({
            className: style.note,
            textContent:
                "3D distance from the boom (a 0.5 m radius cylinder on a 2.5 m high slew deck, both INDICATIVE) " +
                "to each obstacle solid. Clearance limits are INDICATIVE. WARNING and CRITICAL are shown red. " +
                "The 3D results are shown separately: they are not part of the Overall verdict yet.",
        });
        this.m6Rows = div({});
        this.m7Rows = div({});
        this.fromInput = this.numInput(DEFAULT_SWEEP.fromDeg);
        this.toInput = this.numInput(DEFAULT_SWEEP.toDeg);
        this.stepInput = this.numInput(DEFAULT_SWEEP.stepDeg);
        this.runButton = document.createElement("button");
        this.runButton.textContent = "Run swing sweep";
        this.runButton.className = style.runButton;
        this.runButton.addEventListener("click", () => this.runSweep());

        this.el = div(
            { className: style.section },
            div({ className: style.sectionTitle, textContent: "3D Boom Clearance (M6)" }),
            this.noteEl,
            this.m6Rows,
            div({ className: style.sectionTitle, textContent: "Swing Sweep (M7)" }),
            div({
                className: style.note,
                textContent:
                    "Samples the slew between the pick and the set angle and reports the worst distance.",
            }),
            this.field("Pick angle", this.fromInput, "deg"),
            this.field("Set angle", this.toInput, "deg"),
            this.field("Step", this.stepInput, "deg"),
            this.runButton,
            this.m7Rows,
        );
        this.showNote(this.m6Rows, "—");
        this.showNote(this.m7Rows, "Press “Run swing sweep”.");
    }

    /** New crane position or obstacles: schedule the M6 check. The sweep result is cleared (it is stale). */
    update(input: Clearance3DInput, obstacles: readonly SiteObstacle[]): void {
        if (this.disposed) return;
        this.current = input;
        this.obstacles = obstacles;
        this.showNote(this.m7Rows, "Inputs changed. Press “Run swing sweep” again.");
        const wait = this.options.debounceMs ?? 150;
        if (this.timer !== undefined) clearTimeout(this.timer);
        if (wait <= 0) {
            this.recompute();
            return;
        }
        this.showNote(this.m6Rows, "Calculating…");
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.recompute();
        }, wait);
    }

    /** Invalid panel input: show nothing from an earlier position. */
    clear(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.current = undefined;
        this.showNote(this.m6Rows, "—");
        this.showNote(this.m7Rows, "—");
    }

    dispose(): void {
        this.disposed = true;
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
    }

    /** Runs the M6 check now. Public so tests and callers do not wait for the debounce. */
    recompute(): void {
        if (this.disposed || !this.current) return;
        const prepared = this.prepare();
        if (!prepared) return;
        const { factory, split } = prepared;
        try {
            const report = computeSiteClearance(
                factory,
                toBoomPlacement(this.current),
                split.buildings,
                split.powerLine,
            );
            this.renderM6(report, split.skipped);
        } catch (err) {
            this.showNote(
                this.m6Rows,
                `Cannot calculate: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /** Runs the M7 sweep now with the angles in the inputs. */
    runSweep(): void {
        if (this.disposed || !this.current) return;
        const prepared = this.prepare(this.m7Rows);
        if (!prepared) return;
        const { factory, split } = prepared;
        try {
            const report = sweepSlew(
                factory,
                toSweepPlacement(this.current),
                Number.parseFloat(this.fromInput.value),
                Number.parseFloat(this.toInput.value),
                Number.parseFloat(this.stepInput.value),
                split.buildings,
                split.powerLine,
                KIT.PIVOT_OFFSET_M,
            );
            this.renderM7(report);
        } catch (err) {
            this.showNote(
                this.m7Rows,
                `Cannot run sweep: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    private prepare(
        target: HTMLElement = this.m6Rows,
    ): { factory: IShapeFactory; split: SplitObstacles } | undefined {
        let factory: IShapeFactory | undefined;
        try {
            factory = this.getFactory();
        } catch {
            factory = undefined;
        }
        if (!factory) {
            this.showNote(target, "3D kernel is not ready, so the 3D clearance is NOT CHECKED.");
            return undefined;
        }
        const split = splitObstacles(this.obstacles);
        if (split.buildings.length === 0 && split.powerLine === undefined) {
            this.showNote(target, "No obstacles loaded: the 3D clearance is NOT CHECKED (this is not SAFE).");
            return undefined;
        }
        return { factory, split };
    }

    private renderM6(report: SiteClearanceReport, skipped: readonly string[]): void {
        this.m6Rows.textContent = "";
        if (report.worstCase) {
            this.m6Rows.appendChild(
                this.row(
                    "Minimum distance",
                    `${fmt(report.worstCase.minDistanceM)} m (${report.worstCase.obstacleLabel})`,
                    report.worstCase.status,
                ),
            );
        }
        // Show in the order of the site (stable between updates), not sorted by severity.
        // Match on the obstacle id, not the label: two obstacles can have the same label.
        const byId = new Map<string, ObstacleClearanceResult>();
        for (const o of report.obstacles) byId.set(o.obstacleId, o);
        for (let i = 0; i < this.obstacles.length; i++) {
            const r = byId.get(obstacleId(i));
            if (!r) continue;
            const text = r.isCollision
                ? `COLLISION (${fmt(r.minDistanceM)} m)`
                : `${fmt(r.minDistanceM)} m (limit ${fmt(r.clearanceLimitM)} m)`;
            this.m6Rows.appendChild(this.row(r.obstacleLabel, text, r.status));
        }
        if (skipped.length > 0) {
            this.m6Rows.appendChild(
                div({
                    className: style.note,
                    textContent: `Not checked in 3D (no polygon with height, or a second power line): ${skipped.join(", ")}`,
                }),
            );
        }
    }

    private renderM7(report: SwingSweepReport): void {
        this.m7Rows.textContent = "";
        if (!report.worstStep) {
            this.showNote(
                this.m7Rows,
                "No obstacles were checked: the sweep is NOT CHECKED (this is not SAFE).",
            );
            return;
        }
        const w = report.worstStep;
        this.m7Rows.appendChild(
            this.row(
                "Worst distance",
                `${fmt(w.result.minDistanceM)} m at ${fmt(w.slewDeg, 1)}° (${w.result.obstacleLabel})`,
                w.result.status,
            ),
        );
        this.m7Rows.appendChild(
            this.row(
                "Whole swing",
                report.guaranteedMinDistanceM === null
                    ? "—"
                    : `guaranteed at least ${fmt(report.guaranteedMinDistanceM)} m`,
                report.sweepStatus,
            ),
        );
        this.m7Rows.appendChild(
            div({
                className: style.note,
                textContent: `${report.sampleCount} angles from ${fmt(report.fromDeg, 1)}° to ${fmt(report.toDeg, 1)}°, step ${fmt(report.stepDeg, 2)}°. ${report.sweepStatusNote}`,
            }),
        );
    }

    private row(label: string, value: string, status: "SAFE" | "WARNING" | "CRITICAL" | null): HTMLElement {
        return div(
            { className: style.resultRow },
            span({ className: style.resultLabel, textContent: label }),
            span({ className: style.resultValue }, document.createTextNode(`${value} `), statusBadge(status)),
        );
    }

    private showNote(target: HTMLElement, text: string): void {
        target.textContent = "";
        target.appendChild(div({ className: style.note, textContent: text }));
    }

    private numInput(value: number): HTMLInputElement {
        return input({ type: "number", step: "0.5", value: String(value), className: style.number });
    }

    private field(label: string, inp: HTMLInputElement, unit: string): HTMLElement {
        return div(
            { className: style.field },
            div({ className: style.fieldHead }, span({ className: style.fieldLabel, textContent: label })),
            div({ className: style.inputRow }, inp, span({ className: style.unit, textContent: unit })),
        );
    }
}
