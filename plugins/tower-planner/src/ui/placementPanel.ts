// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type I18nKeys, type IDocument, type IView, Plane, PubSub, screenDistance, XYZ } from "@chili3d/core";
import { div, input, span } from "@chili3d/element";
import {
    type CraneDimension,
    type CraneLayout,
    type CranePlacement,
    createDefaultCraneCatalogue,
    DEFAULT_TOWER_CRANE_PLACEMENT,
    deriveCraneLayout,
    metresToMillimetres,
    millimetresToMetres,
    PLANNING_DISCLAIMER,
    validateCraneCatalogue,
} from "../model/cranePlacement";
import { CraneScene } from "../view/craneScene";
import style from "./placementPanel.module.css";

const MAST_PICK_RADIUS_PX = 24;

type ResultRow = {
    readonly element: HTMLElement;
    readonly value: HTMLElement;
};

type ResultRows = {
    readonly mast: ResultRow;
    readonly slew: ResultRow;
    readonly minRing: ResultRow;
    readonly maxRing: ResultRow;
    readonly counterRing: ResultRow;
    readonly jibTip: ResultRow;
    readonly counterTip: ResultRow;
    readonly baseRing: ResultRow;
};

function formatNumber(value: number, digits = 3): string {
    const normalized = Math.abs(value) < 10 ** -digits / 2 ? 0 : value;
    return normalized.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

function formatPoint(point: { x: number; y: number }): string {
    return `(${point.x.toFixed(2)}, ${point.y.toFixed(2)}) m`;
}

export class TowerCranePlacementPanel {
    private readonly scene: CraneScene;
    private readonly root: HTMLElement;
    private readonly mastX: HTMLInputElement;
    private readonly mastY: HTMLInputElement;
    private readonly slewNumber: HTMLInputElement;
    private readonly slewSlider: HTMLInputElement;
    private readonly minHookRadius: HTMLInputElement;
    private readonly maxHookRadius: HTMLInputElement;
    private readonly counterJibRadius: HTMLInputElement;
    private readonly errors: HTMLElement;
    private readonly results: ResultRows;

    private catalogue = createDefaultCraneCatalogue();
    private placement: CranePlacement = { ...DEFAULT_TOWER_CRANE_PLACEMENT };
    private layout: CraneLayout = deriveCraneLayout(this.catalogue, this.placement);
    private dom: HTMLElement | undefined;
    private dragPointerId: number | undefined;
    private disposed = false;
    private shown = false;
    private onDisposeCallback: (() => void) | undefined;

    constructor(private readonly view: IView) {
        this.scene = new CraneScene(view);
        this.mastX = this.createNumberInput(this.placement.x);
        this.mastY = this.createNumberInput(this.placement.y);
        this.slewNumber = this.createNumberInput(this.placement.slewAngleDeg, 1);
        this.slewSlider = input({ type: "range", min: "0", max: "360", step: "1", className: style.slider });
        this.minHookRadius = this.createNumberInput(this.catalogue.minHookRadius.value);
        this.maxHookRadius = this.createNumberInput(this.catalogue.maxHookRadius.value);
        this.counterJibRadius = this.createNumberInput(this.catalogue.counterJibRadius.value);
        this.errors = div({ className: style.errors, role: "alert" });

        this.results = {
            mast: this.createResultRow("Mast"),
            slew: this.createResultRow("Slew"),
            minRing: this.createResultRow("Min hook ring"),
            maxRing: this.createResultRow("Max hook ring"),
            counterRing: this.createResultRow("Counter-jib sweep"),
            jibTip: this.createResultRow("Jib tip"),
            counterTip: this.createResultRow("Counter-jib tip"),
            baseRing: this.createResultRow("Base exclusion"),
        };

        this.slewSlider.value = String(this.layout.slewAngleDeg);
        this.root = this.createContent();
        this.bindInputs();
    }

    onDispose(callback: () => void) {
        if (this.disposed) {
            callback();
            return;
        }
        this.onDisposeCallback = callback;
    }

    show() {
        if (this.disposed || this.shown) return;
        this.shown = true;

        this.scene.update(this.layout);
        this.renderResults(this.layout);
        PubSub.default.sub("documentClosed", this.handleDocumentClosed);
        PubSub.default.pub("showFloatPanel", {
            title: "towerplanner.panel.title" as I18nKeys,
            content: this.root,
            document: this.view.document,
            width: 390,
            height: 620,
            minWidth: 340,
            minHeight: 480,
            onClose: () => this.dispose(),
        });
        this.attachViewEvents();
    }

    private createContent(): HTMLElement {
        return div(
            { className: style.root },
            div({ className: style.disclaimer, textContent: PLANNING_DISCLAIMER }),
            div(
                { className: style.note },
                "Drag the mast marker in the viewport to move the crane. Rings and results update live; there is no Calculate step.",
            ),
            this.createSection(
                "Crane dimensions",
                this.createDimensionField(
                    "Minimum hook radius",
                    this.catalogue.minHookRadius,
                    this.minHookRadius,
                ),
                this.createDimensionField(
                    "Maximum hook radius",
                    this.catalogue.maxHookRadius,
                    this.maxHookRadius,
                ),
                this.createDimensionField(
                    "Counter-jib radius",
                    this.catalogue.counterJibRadius,
                    this.counterJibRadius,
                ),
                div(
                    { className: style.note },
                    "INDICATIVE values only. Replace each value from the crane load chart and cite the document and page before planning.",
                ),
            ),
            this.createSection(
                "Placement",
                this.createPlainField("Mast X", this.mastX),
                this.createPlainField("Mast Y", this.mastY),
                this.createPlainField("Slew angle", this.slewNumber, "°"),
                this.slewSlider,
            ),
            this.createSection(
                "Derived result",
                this.results.mast.element,
                this.results.slew.element,
                this.results.minRing.element,
                this.results.maxRing.element,
                this.results.counterRing.element,
                this.results.jibTip.element,
                this.results.counterTip.element,
                this.results.baseRing.element,
            ),
            this.errors,
        );
    }

    private createSection(title: string, ...children: HTMLElement[]): HTMLElement {
        return div(
            { className: style.section },
            div({ className: style.sectionTitle, textContent: title }),
            ...children,
        );
    }

    private createDimensionField(
        label: string,
        dimension: CraneDimension,
        element: HTMLInputElement,
    ): HTMLElement {
        return div(
            { className: style.field },
            div(
                { className: style.fieldHead },
                span({ className: style.fieldLabel, textContent: label }),
                this.createSourceBadge(dimension),
            ),
            div({ className: style.inputRow }, element, span({ className: style.unit, textContent: "m" })),
        );
    }

    private createSourceBadge(dimension: CraneDimension): HTMLElement {
        const source = dimension.source;
        const text = source.kind === "sourced" ? `${source.document} p.${source.page}` : "INDICATIVE";
        return span({ className: style.badge, textContent: text });
    }

    private createPlainField(label: string, element: HTMLInputElement, unit = "m"): HTMLElement {
        return div(
            { className: style.field },
            div({ className: style.fieldHead }, span({ className: style.fieldLabel, textContent: label })),
            div({ className: style.inputRow }, element, span({ className: style.unit, textContent: unit })),
        );
    }

    private createNumberInput(value: number, step = 0.1): HTMLInputElement {
        return input({
            type: "number",
            step: String(step),
            className: style.number,
            value: formatNumber(value),
        });
    }

    private createResultRow(label: string): ResultRow {
        const value = span({ className: style.resultValue, textContent: "—" });
        return {
            element: div(
                { className: style.resultRow },
                span({ className: style.resultLabel, textContent: label }),
                value,
            ),
            value,
        };
    }

    private bindInputs() {
        this.mastX.addEventListener("input", this.handleFieldInput);
        this.mastY.addEventListener("input", this.handleFieldInput);
        this.minHookRadius.addEventListener("input", this.handleFieldInput);
        this.maxHookRadius.addEventListener("input", this.handleFieldInput);
        this.counterJibRadius.addEventListener("input", this.handleFieldInput);
        this.slewNumber.addEventListener("input", this.handleFieldInput);
        this.slewSlider.addEventListener("input", this.handleSliderInput);
    }

    private handleFieldInput = () => {
        this.applyFieldValues();
    };

    private handleSliderInput = () => {
        this.slewNumber.value = this.slewSlider.value;
        this.applyFieldValues();
    };

    private applyFieldValues() {
        const catalogue = {
            ...this.catalogue,
            minHookRadius: { ...this.catalogue.minHookRadius, value: this.minHookRadius.valueAsNumber },
            maxHookRadius: { ...this.catalogue.maxHookRadius, value: this.maxHookRadius.valueAsNumber },
            counterJibRadius: {
                ...this.catalogue.counterJibRadius,
                value: this.counterJibRadius.valueAsNumber,
            },
        };
        const placement: CranePlacement = {
            x: this.mastX.valueAsNumber,
            y: this.mastY.valueAsNumber,
            slewAngleDeg: this.slewNumber.valueAsNumber,
        };

        this.catalogue = catalogue;
        this.placement = placement;
        this.refresh();
    }

    private refresh() {
        const validation = validateCraneCatalogue(this.catalogue);
        if (!Number.isFinite(this.placement.x) || !Number.isFinite(this.placement.y)) {
            validation.push("Mast X and Mast Y must be finite numbers.");
        }
        if (!Number.isFinite(this.placement.slewAngleDeg)) {
            validation.push("Slew angle must be a finite number.");
        }

        this.setErrors(validation);
        if (validation.length > 0) return;

        this.layout = deriveCraneLayout(this.catalogue, this.placement);
        this.slewSlider.value = String(this.layout.slewAngleDeg);
        this.scene.update(this.layout);
        this.renderResults(this.layout);
    }

    private setErrors(errors: string[]) {
        this.errors.hidden = errors.length === 0;
        this.errors.textContent = errors.join(" ");
    }

    private renderResults(layout: CraneLayout) {
        this.results.mast.value.textContent = formatPoint(layout.mast);
        this.results.slew.value.textContent = `${layout.slewAngleDeg.toFixed(1)}°`;
        this.results.minRing.value.textContent = `${layout.rings.minHookRadius.radius.toFixed(2)} m`;
        this.results.maxRing.value.textContent = `${layout.rings.maxHookRadius.radius.toFixed(2)} m`;
        this.results.counterRing.value.textContent = `${layout.rings.counterJibSweep.radius.toFixed(2)} m`;
        this.results.jibTip.value.textContent = formatPoint(layout.jibTip);
        this.results.counterTip.value.textContent = formatPoint(layout.counterJibTip);
        this.results.baseRing.value.textContent = `${layout.rings.baseExclusion.radius.toFixed(2)} m`;
    }

    private syncMastInputs() {
        this.mastX.value = formatNumber(this.placement.x);
        this.mastY.value = formatNumber(this.placement.y);
    }

    private attachViewEvents() {
        this.detachViewEvents();

        const dom = this.view.dom;
        if (!dom) return;

        this.dom = dom;
        dom.addEventListener("pointerdown", this.handlePointerDown, true);
        dom.addEventListener("pointermove", this.handlePointerMove, true);
        dom.addEventListener("pointerup", this.handlePointerUp, true);
        dom.addEventListener("pointercancel", this.handlePointerUp, true);
        dom.addEventListener("lostpointercapture", this.handleLostPointerCapture, true);
    }

    private detachViewEvents() {
        if (this.dragPointerId !== undefined) {
            this.endDrag(this.dragPointerId);
        }

        const dom = this.dom;
        if (!dom) return;

        dom.removeEventListener("pointerdown", this.handlePointerDown, true);
        dom.removeEventListener("pointermove", this.handlePointerMove, true);
        dom.removeEventListener("pointerup", this.handlePointerUp, true);
        dom.removeEventListener("pointercancel", this.handlePointerUp, true);
        dom.removeEventListener("lostpointercapture", this.handleLostPointerCapture, true);
        dom.style.cursor = "";
        this.dom = undefined;
    }

    private handlePointerDown = (event: PointerEvent) => {
        if (this.disposed || event.button !== 0 || !event.isPrimary) return;
        if (!this.isNearMast(event)) return;

        event.preventDefault();
        event.stopPropagation();
        this.dom?.setPointerCapture(event.pointerId);
        this.dragPointerId = event.pointerId;
        if (this.dom) this.dom.style.cursor = "grabbing";
        this.moveMastToPointer(event);
    };

    private handlePointerMove = (event: PointerEvent) => {
        if (event.pointerId !== this.dragPointerId) return;

        event.preventDefault();
        event.stopPropagation();
        this.moveMastToPointer(event);
    };

    private handlePointerUp = (event: PointerEvent) => {
        if (event.pointerId !== this.dragPointerId) return;

        event.preventDefault();
        event.stopPropagation();
        this.endDrag(event.pointerId);
    };

    private handleLostPointerCapture = (event: PointerEvent) => {
        if (event.pointerId !== this.dragPointerId) return;
        this.endDrag(event.pointerId);
    };

    private endDrag(pointerId: number) {
        if (this.dom?.hasPointerCapture(pointerId)) {
            this.dom.releasePointerCapture(pointerId);
        }
        this.dragPointerId = undefined;
        if (this.dom) this.dom.style.cursor = "";
    }

    private moveMastToPointer(event: PointerEvent) {
        if (!this.dom) return;

        const rect = this.dom.getBoundingClientRect();
        const point = Plane.XY.intersectRay(
            this.view.rayAt(event.clientX - rect.left, event.clientY - rect.top),
        );
        if (!point) return;

        this.placement = {
            ...this.placement,
            x: roundMillimetres(millimetresToMetres(point.x)),
            y: roundMillimetres(millimetresToMetres(point.y)),
        };
        this.syncMastInputs();
        this.refresh();
    }

    private isNearMast(event: PointerEvent): boolean {
        if (!this.dom) return false;

        const rect = this.dom.getBoundingClientRect();
        const mast = new XYZ(
            metresToMillimetres(this.layout.mast.x),
            metresToMillimetres(this.layout.mast.y),
            0,
        );
        return (
            screenDistance(this.view, event.clientX - rect.left, event.clientY - rect.top, mast) <=
            MAST_PICK_RADIUS_PX
        );
    }

    private readonly handleDocumentClosed = (document: IDocument) => {
        if (document === this.view.document) {
            this.dispose(false);
        }
    };

    dispose(updateScene = true) {
        if (this.disposed) return;
        this.disposed = true;

        PubSub.default.remove("documentClosed", this.handleDocumentClosed);
        this.mastX.removeEventListener("input", this.handleFieldInput);
        this.mastY.removeEventListener("input", this.handleFieldInput);
        this.minHookRadius.removeEventListener("input", this.handleFieldInput);
        this.maxHookRadius.removeEventListener("input", this.handleFieldInput);
        this.counterJibRadius.removeEventListener("input", this.handleFieldInput);
        this.slewNumber.removeEventListener("input", this.handleFieldInput);
        this.slewSlider.removeEventListener("input", this.handleSliderInput);

        this.detachViewEvents();
        this.scene.dispose(updateScene);
        this.root.remove();
        this.onDisposeCallback?.();
        this.onDisposeCallback = undefined;
    }
}

function roundMillimetres(value: number): number {
    return Math.round(value * 1000) / 1000;
}
