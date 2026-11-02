// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IView, PubSub, type PubSubEventMap } from "@chili3d/core";
import { createMockView } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";
import { TowerCranePlacementPanel } from "../src/ui/placementPanel";

afterEach(() => {
    PubSub.default.removeAll("showFloatPanel");
    PubSub.default.removeAll("documentClosed");
    PubSub.default.removeAll("viewClosed");
    PubSub.default.removeAll("activeViewChanged");
    rs.restoreAllMocks();
});

function createDom(): HTMLElement {
    const dom = document.createElement("div");
    dom.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect;
    dom.setPointerCapture = rs.fn();
    dom.hasPointerCapture = rs.fn(() => false);
    dom.releasePointerCapture = rs.fn();
    return dom;
}

function dispatchPointer(dom: HTMLElement, type: string, props: Partial<PointerEvent> = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
        button: 0,
        isPrimary: true,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        ...props,
    });
    dom.dispatchEvent(event);
}

function showPanel(view: IView) {
    let content: HTMLElement | undefined;
    const handler: PubSubEventMap["showFloatPanel"] = (options) => {
        content = options.content;
    };
    PubSub.default.sub("showFloatPanel", handler);
    const panel = new TowerCranePlacementPanel(view);
    panel.show();
    PubSub.default.remove("showFloatPanel", handler);
    if (!content) throw new Error("panel content was not published");
    return { panel, content };
}

function findSpan(content: HTMLElement, text: string): HTMLSpanElement {
    const element = [...content.querySelectorAll("span")].find((span) => span.textContent === text);
    if (!element) throw new Error(`missing span: ${text}`);
    return element;
}

function fieldInput(content: HTMLElement, label: string): HTMLInputElement {
    const labelElement = findSpan(content, label);
    const input = labelElement.parentElement?.parentElement?.querySelector("input");
    if (!input) throw new Error(`missing input for: ${label}`);
    return input;
}

function resultValue(content: HTMLElement, label: string): string | null | undefined {
    return findSpan(content, label).nextElementSibling?.textContent;
}

test("repeated show attaches each subscription once and dispose releases them once", () => {
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const subSpy = rs.spyOn(PubSub.default, "sub");
    const removeSpy = rs.spyOn(PubSub.default, "remove");
    const addSpy = rs.spyOn(dom, "addEventListener");
    const onDispose = rs.fn();
    const panel = new TowerCranePlacementPanel(view);
    panel.onDispose(onDispose);

    panel.show();
    panel.show();

    expect(subSpy.mock.calls.filter(([event]) => event === "documentClosed")).toHaveLength(1);
    expect(subSpy.mock.calls.filter(([event]) => event === "viewClosed")).toHaveLength(1);
    expect(subSpy.mock.calls.filter(([event]) => event === "activeViewChanged")).toHaveLength(1);
    expect(addSpy.mock.calls.filter(([type]) => type === "pointerdown")).toHaveLength(1);

    panel.dispose();
    panel.dispose();

    expect(removeSpy).toHaveBeenCalledWith("documentClosed", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("viewClosed", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("activeViewChanged", expect.any(Function));
    expect(onDispose).toHaveBeenCalledTimes(1);
});

test("viewClosed disposes the panel and clears the overlay", () => {
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel } = showPanel(view);
    const onDispose = rs.fn();
    panel.onDispose(onDispose);
    const removeSpy = rs.spyOn(view.document.visual.context, "removeMesh");

    PubSub.default.pub("viewClosed", view);

    expect(removeSpy).toHaveBeenCalledTimes(6);
    expect(onDispose).toHaveBeenCalledTimes(1);
});

test("activeViewChanged rebinds drag and overlay to another view of the same document", () => {
    const dom1 = createDom();
    const view1 = createMockView({ dom: dom1 } as Partial<IView>);
    const { panel } = showPanel(view1);
    const dom2 = createDom();
    const update2 = rs.fn();
    const view2 = createMockView({
        dom: dom2,
        document: view1.document,
        update: update2,
    } as Partial<IView>);
    const remove1 = rs.spyOn(dom1, "removeEventListener");
    const add2 = rs.spyOn(dom2, "addEventListener");

    PubSub.default.pub("activeViewChanged", view2);

    expect(remove1).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(add2).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(update2).toHaveBeenCalled();
    panel.dispose();
});

test("dragging the mast updates inputs and results live", () => {
    // Hand-worked: mock view screen (400,300) = world (0,0) mm and
    // screen (500,300) = world (100,0) mm = (0.1,0) m.
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel, content } = showPanel(view);
    const mastX = fieldInput(content, "Mast X");
    const mastY = fieldInput(content, "Mast Y");

    dispatchPointer(dom, "pointerdown", { clientX: 400, clientY: 300 });
    dispatchPointer(dom, "pointermove", { clientX: 500, clientY: 300 });

    expect(mastX.value).toBe("0.1");
    expect(mastY.value).toBe("0");
    expect(resultValue(content, "Mast")).toBe("(0.10, 0.00) m");
    expect(resultValue(content, "Max hook ring")).toBe("40.00 m");
    expect(resultValue(content, "Base exclusion")).toBe("20.00 m");
    panel.dispose();
});

test("rotation updates jib and counter-jib results through number and slider inputs", () => {
    // Hand-worked: mast (0,0), max radius 40 m, counter-jib radius 15 m.
    // Slew 90 deg -> jib tip (0,40) and counter tip (0,-15).
    // Slew 180 deg -> jib tip (-40,0) and counter tip (15,0).
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel, content } = showPanel(view);
    const slew = fieldInput(content, "Slew angle");
    const slider = content.querySelector('input[type="range"]') as HTMLInputElement;

    slew.value = "90";
    slew.dispatchEvent(new Event("input", { bubbles: true }));

    expect(resultValue(content, "Slew")).toBe("90.0°");
    expect(resultValue(content, "Jib tip")).toBe("(0.00, 40.00) m");
    expect(resultValue(content, "Counter-jib tip")).toBe("(0.00, -15.00) m");
    expect(slider.value).toBe("90");

    slider.value = "180";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    expect(slew.value).toBe("180");
    expect(resultValue(content, "Jib tip")).toBe("(-40.00, 0.00) m");
    expect(resultValue(content, "Counter-jib tip")).toBe("(15.00, 0.00) m");
    panel.dispose();
});

test("changing a dimension updates results immediately without a Calculate step", () => {
    // Hand-worked: mast (0,0), slew 0, max radius 50 m -> jib tip (50,0).
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel, content } = showPanel(view);
    const maxRadius = fieldInput(content, "Maximum hook radius");

    expect(content.querySelectorAll("button")).toHaveLength(0);

    maxRadius.value = "50";
    maxRadius.dispatchEvent(new Event("input", { bubbles: true }));

    expect(resultValue(content, "Max hook ring")).toBe("50.00 m");
    expect(resultValue(content, "Jib tip")).toBe("(50.00, 0.00) m");
    panel.dispose();
});

test("invalid input clears rings and results instead of leaving stale values", () => {
    // Hand-worked: max radius 0 m is invalid, so no ring or result may remain.
    // After fixing max radius to 40 m with mast X = 5 m, the results are
    // mast (5,0) and max ring 40 m.
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel, content } = showPanel(view);
    const errors = content.querySelector('[role="alert"]') as HTMLElement;
    const maxRadius = fieldInput(content, "Maximum hook radius");
    const mastX = fieldInput(content, "Mast X");
    const displaySpy = rs.spyOn(view.document.visual.context, "displayMesh");
    const removeSpy = rs.spyOn(view.document.visual.context, "removeMesh");
    expect(errors.hidden).toBe(true);

    maxRadius.value = "0";
    maxRadius.dispatchEvent(new Event("input", { bubbles: true }));

    expect(errors.hidden).toBe(false);
    expect(errors.textContent).toContain("Maximum hook radius must be greater than 0 m.");
    expect(resultValue(content, "Mast")).toBe("—");
    expect(resultValue(content, "Max hook ring")).toBe("—");
    expect(displaySpy).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledTimes(6);

    mastX.value = "5";
    mastX.dispatchEvent(new Event("input", { bubbles: true }));

    expect(resultValue(content, "Mast")).toBe("—");
    expect(displaySpy).not.toHaveBeenCalled();

    maxRadius.value = "40";
    maxRadius.dispatchEvent(new Event("input", { bubbles: true }));

    expect(errors.hidden).toBe(true);
    expect(displaySpy).toHaveBeenCalledTimes(6);
    expect(resultValue(content, "Mast")).toBe("(5.00, 0.00) m");
    expect(resultValue(content, "Max hook ring")).toBe("40.00 m");
    panel.dispose();
});
