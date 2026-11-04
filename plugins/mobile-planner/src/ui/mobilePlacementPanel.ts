// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 — Mobile Crane Placement Panel (UI)
// Owner: Ajit
// ============================================================================

import { type I18nKeys, type IView, PubSub } from "@chili3d/core";
import { div, input, span } from "@chili3d/element";
import { MobileCraneBodyNode } from "../body/mobileCraneBody";
import { BOOM_LENGTHS_M, KIT } from "../modules/craneModel";
import { PLANNING_DISCLAIMER } from "../modules/outriggers";
import {
    computePlacement,
    createDefaultPlacementInput,
    type MobilePlacementInput,
    type MobilePlacementResult,
    type SiteObstacle,
    validatePlacementInput,
} from "../modules/placementState";
import { SAMPLE_SITE_OBSTACLES } from "../modules/sampleSiteObstacles";
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

    // Feedback & Result rows
    private readonly errorBanner: HTMLElement;
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
    private readonly obstacleContainer: HTMLElement;
    private readonly rOverall: ResultRow;
    private readonly reasonsContainer: HTMLElement;

    private state: MobilePlacementInput;
    private obstacles: readonly SiteObstacle[] = SAMPLE_SITE_OBSTACLES;
    private craneMarkerNode: MobileCraneBodyNode | undefined;
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

        // Feedback / banners
        this.errorBanner = div({ className: style.errorBanner });
        this.errorBanner.style.display = "none";

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
        this.reasonsContainer = div({ className: style.reasonList });
        this.obstacleContainer = div({ className: style.section });

        this.root = this.buildLayout();
        this.bindInputs();
        this.initCraneMarkerNode();
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
            width: 420,
            height: 720,
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
    // 3D Crane Marker integration
    // -----------------------------------------------------------------------

    private initCraneMarkerNode(): void {
        try {
            const doc = this.view.document;
            if (!doc?.modelManager) return;

            let existing: MobileCraneBodyNode | undefined;
            let current = doc.modelManager.rootNode?.firstChild;
            while (current) {
                if (current instanceof MobileCraneBodyNode) {
                    existing = current;
                    break;
                }
                current = (current as { nextSibling?: typeof current }).nextSibling;
            }

            if (existing) {
                this.craneMarkerNode = existing;
            } else {
                const node = new MobileCraneBodyNode({
                    document: doc,
                    craneCentreXM: this.state.craneCentreXM,
                    craneCentreYM: this.state.craneCentreYM,
                    slewAngleDeg: this.state.slewAngleDeg,
                    boomLengthM: this.state.boomLengthM,
                    boomAngleDeg: this.state.boomAngleDeg,
                });
                doc.modelManager.addNode(node);
                this.craneMarkerNode = node;
            }
        } catch {
            // Ignore if in test mock environment without full document
        }
    }

    private syncCraneMarker(input: MobilePlacementInput): void {
        if (!this.craneMarkerNode) return;
        try {
            this.craneMarkerNode.craneCentreXM = input.craneCentreXM;
            this.craneMarkerNode.craneCentreYM = input.craneCentreYM;
            this.craneMarkerNode.slewAngleDeg = input.slewAngleDeg;
            this.craneMarkerNode.boomLengthM = input.boomLengthM;
            this.craneMarkerNode.boomAngleDeg = input.boomAngleDeg;
        } catch {
            // Safe fallback
        }
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
            // Error banner for invalid inputs
            this.errorBanner,
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
            this.section("Verdict", [this.rOverall.el, this.reasonsContainer]),
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
        return `${KIT.name} (source: ${KIT.source.document}; ${KIT.source.status})`;
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
        const parseOrNull = (el: HTMLInputElement): number | null => {
            const raw = el.value.trim();
            if (raw === "") return null;
            const v = parseFloat(raw);
            return Number.isFinite(v) ? v : null;
        };

        const x = parseOrNull(this.craneXInput);
        const y = parseOrNull(this.craneYInput);
        const slew = parseOrNull(this.slewInput);
        const boomLength = parseFloat(this.boomLengthSelect.value);
        const boomAngle = parseOrNull(this.boomAngleInput);
        const payload = parseOrNull(this.payloadInput);
        const rigging = parseOrNull(this.riggingInput);
        const craneWeight = parseOrNull(this.craneWeightInput);
        const outriggerL = parseOrNull(this.outriggerLInput);
        const outriggerW = parseOrNull(this.outriggerWInput);
        const padArea = parseOrNull(this.padAreaInput);
        const allowableRaw = parseOrNull(this.allowableInput);

        if (
            x === null ||
            y === null ||
            slew === null ||
            !Number.isFinite(boomLength) ||
            boomAngle === null ||
            payload === null ||
            rigging === null ||
            craneWeight === null ||
            outriggerL === null ||
            outriggerW === null ||
            padArea === null
        ) {
            this.renderInvalidInput("Please enter valid numbers in all fields");
            return;
        }

        const candidateInput: MobilePlacementInput = {
            craneCentreXM: x,
            craneCentreYM: y,
            slewAngleDeg: slew,
            boomLengthM: boomLength,
            boomAngleDeg: boomAngle,
            payloadT: payload,
            riggingT: rigging,
            craneWeightT: craneWeight,
            outriggerLengthSpreadM: outriggerL,
            outriggerWidthSpreadM: outriggerW,
            padAreaM2: padArea,
            allowableBearingT_M2: allowableRaw !== null && allowableRaw > 0 ? allowableRaw : undefined,
        };

        const errors = validatePlacementInput(candidateInput);
        if (errors.length > 0) {
            this.renderInvalidInput(errors[0]);
            return;
        }

        this.state = candidateInput;
        this.errorBanner.style.display = "none";
        this.syncCraneMarker(candidateInput);
        this.refresh();
    }

    private renderInvalidInput(message: string): void {
        this.errorBanner.textContent = `Invalid input: ${message}`;
        this.errorBanner.style.display = "block";

        // Blank out outputs so no stale values are shown
        this.rRadius.val.textContent = "—";
        this.rCapacity.val.textContent = "—";
        this.rUtilisation.val.textContent = "—";
        this.rCapVerdict.val.textContent = "—";
        this.rPadFL.val.textContent = "—";
        this.rPadFR.val.textContent = "—";
        this.rPadRL.val.textContent = "—";
        this.rPadRR.val.textContent = "—";
        this.rStability.val.textContent = "—";
        this.rBearing.val.textContent = "—";

        this.obstacleContainer.textContent = "";
        this.obstacleContainer.appendChild(
            div({ className: style.sectionTitle, textContent: "Obstacle Clearances" }),
        );
        this.obstacleContainer.appendChild(div({ className: style.note, textContent: "—" }));

        this.rOverall.val.textContent = "";
        this.rOverall.val.appendChild(badge("INVALID INPUT", "warn"));
        this.reasonsContainer.textContent = "";
    }

    // -----------------------------------------------------------------------
    // Single-tick refresh: ALL outputs recomputed from current input
    // -----------------------------------------------------------------------

    private refresh(): void {
        if (this.disposed) return;

        try {
            const r = computePlacement(this.state, this.obstacles);
            this.renderResults(r);
        } catch (err) {
            this.renderInvalidInput(err instanceof Error ? err.message : "Calculation error");
        }
    }

    private renderResults(r: MobilePlacementResult): void {
        this.errorBanner.style.display = "none";

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

        // Ground Bearing
        this.rBearing.val.textContent = `${fmt(r.worstPadBearing.pressureKPa, 1)} kPa `;
        if (r.bearingStatus === "NOT_CHECKED") {
            this.rBearing.val.appendChild(badge("NOT CHECKED", "warn"));
        } else {
            this.rBearing.val.appendChild(
                badge(r.bearingStatus, r.bearingStatus === "PASS" ? "pass" : "fail"),
            );
        }

        // Obstacles
        this.obstacleContainer.textContent = "";
        this.obstacleContainer.appendChild(
            div({ className: style.sectionTitle, textContent: "Obstacle Clearances (Sample Site)" }),
        );
        if (r.obstacleClearances.length === 0) {
            this.obstacleContainer.appendChild(
                div({ className: style.note, textContent: "No site obstacles checked." }),
            );
        } else {
            for (const c of r.obstacleClearances) {
                const row = resultRow(c.label);
                const prefix = c.isCollision ? "COLLISION (0 m) " : `${fmt(c.marginM)} m margin `;
                row.val.textContent = prefix;
                row.val.appendChild(badge(c.status, c.status === "PASS" ? "pass" : "fail"));
                this.obstacleContainer.appendChild(row.el);
            }
        }

        // Overall Safety Verdict
        this.rOverall.val.textContent = "";
        const overallCls =
            r.overallVerdict === "ALL PASS" ? "pass" : r.overallVerdict === "FAIL" ? "fail" : "warn";
        this.rOverall.val.appendChild(badge(r.overallVerdict, overallCls));

        // Incomplete reasons
        this.reasonsContainer.textContent = "";
        if (r.incompleteReasons.length > 0) {
            this.reasonsContainer.textContent = `Reasons: ${r.incompleteReasons.join(" • ")}`;
        }
    }
}
