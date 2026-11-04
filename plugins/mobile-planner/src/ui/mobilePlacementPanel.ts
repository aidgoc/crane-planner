// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 — Mobile Crane Placement Panel (UI)
// Owner: Ajit
// ============================================================================

import { type I18nKeys, type IView, PubSub } from "@chili3d/core";
import { div, input, span } from "@chili3d/element";
import { PLANNING_DISCLAIMER } from "../modules/outriggers";
import {
    computePlacement,
    createDefaultPlacementInput,
    type MobilePlacementInput,
    type MobilePlacementResult,
    type SiteObstacle,
} from "../modules/placementState";
import style from "./mobilePlacementPanel.module.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(value: number, digits = 2): string {
    const n = Math.abs(value) < 10 ** -digits / 2 ? 0 : value;
    return n.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

type ResultRow = { readonly el: HTMLElement; readonly val: HTMLElement };

function resultRow(label: string): ResultRow {
    const val = span({ className: style.resultValue });
    const el = div(
        { className: style.resultRow },
        span({ className: style.resultLabel, textContent: label }),
        val,
    );
    return { el, val };
}

function badge(text: string, status: "pass" | "fail" | "warn"): HTMLElement {
    const cls = status === "pass" ? style.badgePass : status === "fail" ? style.badgeFail : style.badgeWarn;
    return span({ className: cls, textContent: text });
}

// ---------------------------------------------------------------------------
// Available boom lengths from KIT chart
// ---------------------------------------------------------------------------

const BOOM_LENGTHS_M = [13.3, 23.6, 38, 52.4, 70] as const;

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export class MobileCranePlacementPanel {
    private readonly root: HTMLElement;

    // Inputs
    private readonly craneXInput: HTMLInputElement;
    private readonly craneYInput: HTMLInputElement;
    private readonly slewInput: HTMLInputElement;
    private readonly slewSlider: HTMLInputElement;
    private readonly boomLengthSelect: HTMLSelectElement;
    private readonly boomAngleInput: HTMLInputElement;
    private readonly payloadInput: HTMLInputElement;
    private readonly riggingInput: HTMLInputElement;
    private readonly craneWeightInput: HTMLInputElement;
    private readonly outriggerLInput: HTMLInputElement;
    private readonly outriggerWInput: HTMLInputElement;
    private readonly padAreaInput: HTMLInputElement;
    private readonly allowableInput: HTMLInputElement;

    // Result rows
    private readonly rRadius: ResultRow;
    private readonly rCapacity: ResultRow;
    private readonly rUtilisation: ResultRow;
    private readonly rCapVerdict: ResultRow;
    private readonly rPadFL: ResultRow;
    private readonly rPadFR: ResultRow;
    private readonly rPadRL: ResultRow;
    private readonly rPadRR: ResultRow;
    private readonly rStability: ResultRow;
    private readonly rBearing: ResultRow;
    private readonly rOverall: ResultRow;
    private readonly obstacleContainer: HTMLElement;

    private state: MobilePlacementInput;
    private obstacles: readonly SiteObstacle[] = [];
    private disposed = false;
    private shown = false;
    private onDisposeCallback: (() => void) | undefined;

    constructor(private readonly view: IView) {
        this.state = createDefaultPlacementInput();

        // Create input fields
        this.craneXInput = this.numInput(this.state.craneCentreXM);
        this.craneYInput = this.numInput(this.state.craneCentreYM);
        this.slewInput = this.numInput(this.state.slewAngleDeg, 1);
        this.slewSlider = input({
            type: "range",
            min: "0",
            max: "360",
            step: "1",
            value: String(this.state.slewAngleDeg),
            className: style.slider,
        });
        this.boomLengthSelect = this.createBoomSelect(this.state.boomLengthM);
        this.boomAngleInput = this.numInput(this.state.boomAngleDeg, 1);
        this.payloadInput = this.numInput(this.state.payloadT);
        this.riggingInput = this.numInput(this.state.riggingT);
        this.craneWeightInput = this.numInput(this.state.craneWeightT);
        this.outriggerLInput = this.numInput(this.state.outriggerLengthSpreadM);
        this.outriggerWInput = this.numInput(this.state.outriggerWidthSpreadM);
        this.padAreaInput = this.numInput(this.state.padAreaM2);
        this.allowableInput = this.numInput(0);

        // Create result rows
        this.rRadius = resultRow("Operating radius");
        this.rCapacity = resultRow("Chart capacity");
        this.rUtilisation = resultRow("Utilisation");
        this.rCapVerdict = resultRow("Capacity verdict");
        this.rPadFL = resultRow("Pad FL");
        this.rPadFR = resultRow("Pad FR");
        this.rPadRL = resultRow("Pad RL");
        this.rPadRR = resultRow("Pad RR");
        this.rStability = resultRow("Stability");
        this.rBearing = resultRow("Ground bearing (worst)");
        this.rOverall = resultRow("Overall verdict");
        this.obstacleContainer = div({ className: style.section });

        this.root = this.buildLayout();
        this.bindInputs();
    }

    /** Set site obstacles and recompute. */
    setObstacles(obstacles: readonly SiteObstacle[]): void {
        this.obstacles = obstacles;
        this.refresh();
    }

    onDispose(callback: () => void): void {
        if (this.disposed) {
            callback();
            return;
        }
        this.onDisposeCallback = callback;
    }

    show(): void {
        if (this.disposed || this.shown) return;
        this.shown = true;
        this.refresh();
        PubSub.default.pub("showFloatPanel", {
            title: "mobile.placement.title" as I18nKeys,
            content: this.root,
            document: this.view.document,
            width: 400,
            height: 700,
            minWidth: 360,
            minHeight: 500,
            onClose: () => this.dispose(),
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.root.remove();
        this.onDisposeCallback?.();
        this.onDisposeCallback = undefined;
    }

    // -----------------------------------------------------------------------
    // Layout
    // -----------------------------------------------------------------------

    private buildLayout(): HTMLElement {
        return div(
            { className: style.root },
            // Disclaimer
            div({ className: style.disclaimer, textContent: PLANNING_DISCLAIMER }),
            // Crane source note
            div({
                className: style.note,
                textContent: `Crane: ${this.getCraneName()}. All default values are INDICATIVE — replace with your site-specific data.`,
            }),
            // Position section
            this.section("Position", [
                this.field("Centre X", this.craneXInput, "m"),
                this.field("Centre Y", this.craneYInput, "m"),
                this.field("Slew angle", this.slewInput, "deg"),
                this.slewSlider,
            ]),
            // Boom section
            this.section("Boom", [
                this.fieldSelect("Boom length", this.boomLengthSelect, "m"),
                this.field("Boom angle", this.boomAngleInput, "deg"),
            ]),
            // Load section
            this.section("Load", [
                this.field("Payload", this.payloadInput, "t"),
                this.field("Rigging", this.riggingInput, "t"),
            ]),
            // Crane & Outrigger section
            this.section("Crane & Outriggers (INDICATIVE)", [
                this.field("Crane weight", this.craneWeightInput, "t"),
                this.field("Outrigger L spread", this.outriggerLInput, "m"),
                this.field("Outrigger W spread", this.outriggerWInput, "m"),
                this.field("Pad area", this.padAreaInput, "m²"),
                this.field("Allowable bearing", this.allowableInput, "t/m²"),
            ]),
            // Results — Capacity
            this.section("Capacity", [
                this.rRadius.el,
                this.rCapacity.el,
                this.rUtilisation.el,
                this.rCapVerdict.el,
            ]),
            // Results — Outriggers
            this.section("Outrigger Reactions", [
                this.rPadFL.el,
                this.rPadFR.el,
                this.rPadRL.el,
                this.rPadRR.el,
                this.rStability.el,
                this.rBearing.el,
            ]),
            // Results — Obstacles
            this.obstacleContainer,
            // Overall
            this.section("Verdict", [this.rOverall.el]),
        );
    }

    private section(title: string, children: (HTMLElement | HTMLSelectElement)[]): HTMLElement {
        return div(
            { className: style.section },
            div({ className: style.sectionTitle, textContent: title }),
            ...children,
        );
    }

    private field(label: string, inp: HTMLInputElement, unit: string): HTMLElement {
        return div(
            { className: style.field },
            div({ className: style.fieldHead }, span({ className: style.fieldLabel, textContent: label })),
            div({ className: style.inputRow }, inp, span({ className: style.unit, textContent: unit })),
        );
    }

    private fieldSelect(label: string, sel: HTMLSelectElement, unit: string): HTMLElement {
        return div(
            { className: style.field },
            div({ className: style.fieldHead }, span({ className: style.fieldLabel, textContent: label })),
            div({ className: style.inputRow }, sel, span({ className: style.unit, textContent: unit })),
        );
    }

    // -----------------------------------------------------------------------
    // Input creation
    // -----------------------------------------------------------------------

    private numInput(value: number, step = 0.1): HTMLInputElement {
        return input({
            type: "number",
            step: String(step),
            value: String(value),
            className: style.number,
        });
    }

    private createBoomSelect(current: number): HTMLSelectElement {
        const sel = document.createElement("select");
        sel.className = style.number;
        for (const len of BOOM_LENGTHS_M) {
            const opt = document.createElement("option");
            opt.value = String(len);
            opt.textContent = String(len);
            if (len === current) opt.selected = true;
            sel.appendChild(opt);
        }
        return sel;
    }

    private getCraneName(): string {
        try {
            return `Grove GMK5250L-1 (source: Grove GMK5250L-1 load chart, page 17; VERIFIED)`;
        } catch {
            return "Unknown crane";
        }
    }

    // -----------------------------------------------------------------------
    // Input binding — every change triggers a single synchronous recompute
    // -----------------------------------------------------------------------

    private bindInputs(): void {
        const rebind = () => this.readInputsAndRefresh();

        this.craneXInput.addEventListener("input", rebind);
        this.craneYInput.addEventListener("input", rebind);
        this.slewInput.addEventListener("input", () => {
            this.slewSlider.value = this.slewInput.value;
            rebind();
        });
        this.slewSlider.addEventListener("input", () => {
            this.slewInput.value = this.slewSlider.value;
            rebind();
        });
        this.boomLengthSelect.addEventListener("change", rebind);
        this.boomAngleInput.addEventListener("input", rebind);
        this.payloadInput.addEventListener("input", rebind);
        this.riggingInput.addEventListener("input", rebind);
        this.craneWeightInput.addEventListener("input", rebind);
        this.outriggerLInput.addEventListener("input", rebind);
        this.outriggerWInput.addEventListener("input", rebind);
        this.padAreaInput.addEventListener("input", rebind);
        this.allowableInput.addEventListener("input", rebind);
    }

    private readInputsAndRefresh(): void {
        const num = (el: HTMLInputElement, fallback: number): number => {
            const v = parseFloat(el.value);
            return Number.isFinite(v) ? v : fallback;
        };

        const allowableRaw = parseFloat(this.allowableInput.value);

        this.state = {
            craneCentreXM: num(this.craneXInput, 0),
            craneCentreYM: num(this.craneYInput, 0),
            slewAngleDeg: num(this.slewInput, 0),
            boomLengthM: parseFloat(this.boomLengthSelect.value) || 38,
            boomAngleDeg: num(this.boomAngleInput, 60),
            payloadT: num(this.payloadInput, 0),
            riggingT: num(this.riggingInput, 0),
            craneWeightT: num(this.craneWeightInput, 84),
            outriggerLengthSpreadM: num(this.outriggerLInput, 7.7),
            outriggerWidthSpreadM: num(this.outriggerWInput, 7.2),
            padAreaM2: num(this.padAreaInput, 1),
            allowableBearingT_M2:
                Number.isFinite(allowableRaw) && allowableRaw > 0 ? allowableRaw : undefined,
        };

        this.refresh();
    }

    // -----------------------------------------------------------------------
    // Single-tick refresh: ALL outputs recomputed from current input
    // -----------------------------------------------------------------------

    private refresh(): void {
        if (this.disposed) return;

        const r = computePlacement(this.state, this.obstacles);
        this.renderResults(r);
    }

    private renderResults(r: MobilePlacementResult): void {
        // Capacity
        this.rRadius.val.textContent = `${fmt(r.operatingRadiusM)} m`;
        this.rCapacity.val.textContent = r.capacityT !== null ? `${fmt(r.capacityT, 1)} t` : "Outside chart";
        this.rUtilisation.val.textContent = r.utilisation !== null ? `${fmt(r.utilisation * 100, 1)} %` : "—";

        this.rCapVerdict.val.textContent = "";
        this.rCapVerdict.val.appendChild(
            badge(
                r.capacityStatus,
                r.capacityStatus === "PASS" ? "pass" : r.capacityStatus === "FAIL" ? "fail" : "warn",
            ),
        );

        // Pad reactions
        this.rPadFL.val.textContent = `${fmt(r.padReactions.reactions.frontLeft.reactionT)} t`;
        this.rPadFR.val.textContent = `${fmt(r.padReactions.reactions.frontRight.reactionT)} t`;
        this.rPadRL.val.textContent = `${fmt(r.padReactions.reactions.rearLeft.reactionT)} t`;
        this.rPadRR.val.textContent = `${fmt(r.padReactions.reactions.rearRight.reactionT)} t`;

        this.rStability.val.textContent = "";
        this.rStability.val.appendChild(
            badge(r.padReactions.isStable ? "STABLE" : "TIPPING", r.padReactions.isStable ? "pass" : "fail"),
        );

        // Bearing
        this.rBearing.val.textContent = `${fmt(r.worstPadBearing.pressureKPa, 1)} kPa`;
        if (r.worstPadBearing.status !== "NOT_CHECKED") {
            this.rBearing.val.appendChild(document.createTextNode(" "));
            this.rBearing.val.appendChild(
                badge(r.worstPadBearing.status, r.worstPadBearing.status === "PASS" ? "pass" : "fail"),
            );
        }

        // Obstacles
        this.obstacleContainer.textContent = "";
        if (r.obstacleClearances.length > 0) {
            this.obstacleContainer.appendChild(
                div({ className: style.sectionTitle, textContent: "Obstacle Clearances" }),
            );
            for (const c of r.obstacleClearances) {
                const row = resultRow(c.label);
                row.val.textContent = `${fmt(c.marginM)} m `;
                row.val.appendChild(badge(c.status, c.status === "PASS" ? "pass" : "fail"));
                this.obstacleContainer.appendChild(row.el);
            }
        }

        // Overall
        this.rOverall.val.textContent = "";
        this.rOverall.val.appendChild(badge(r.allPass ? "ALL PASS" : "FAIL", r.allPass ? "pass" : "fail"));
    }
}
