// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IView, PubSub, type PubSubEventMap } from "@chili3d/core";
import { createMockView } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";
import type { OversailSite } from "../src/model/oversailTypes";
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

function showPanel(view: IView, site?: OversailSite) {
    let content: HTMLElement | undefined;
    const handler: PubSubEventMap["showFloatPanel"] = (options) => {
        content = options.content;
    };
    PubSub.default.sub("showFloatPanel", handler);
    const panel = new TowerCranePlacementPanel(view, site);
    panel.show();
    PubSub.default.remove("showFloatPanel", handler);
    if (!content) throw new Error("panel content was not published");
    return { panel, content };
}

function setInput(content: HTMLElement, label: string, value: string) {
    const input = fieldInput(content, label);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
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

test("clearance section reports the school oversail from the current crane layout", () => {
    // Hand-worked: mast (30,40), max hook radius 40 m.
    // The school's south edge is y = 78, so the nearest point is (30,78).
    // Distance 38 m -> jib oversail 40 - 38 = 2.0 m, with no oversail permitted.
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const site: OversailSite = {
        boundary: {
            polygon: [
                { x: -1000, y: -1000 },
                { x: 1000, y: -1000 },
                { x: 1000, y: 1000 },
                { x: -1000, y: 1000 },
            ],
            source: "test boundary",
        },
        neighbours: [
            {
                id: "school",
                label: "NEIGHBOUR - SCHOOL (G+2)",
                displayName: "the school",
                polygon: [
                    { x: 8, y: 78 },
                    { x: 52, y: 78 },
                    { x: 52, y: 96 },
                    { x: 8, y: 96 },
                ],
                rule: "no_oversail",
            },
        ],
        noGoZones: [],
    };
    const { panel, content } = showPanel(view, site);

    setInput(content, "Mast X", "30");
    setInput(content, "Mast Y", "40");

    expect(content.querySelector('[data-check-id="boundary"]')?.getAttribute("data-check-status")).toBe(
        "pass",
    );
    const school = content.querySelector('[data-check-id="neighbour:school"]');
    expect(school).not.toBeNull();
    expect(school?.getAttribute("data-check-status")).toBe("fail");
    expect(school?.textContent).toContain("Jib oversails the school by 2.0 m, no oversail permitted");
    panel.dispose();
});

test("clearance section explains when site boundary data is unavailable", () => {
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel, content } = showPanel(view);

    expect(content.textContent).toContain(
        "no boundary polygon supplied. Clearance checks were not performed.",
    );
    expect(content.querySelectorAll("[data-check-id]")).toHaveLength(0);
    panel.dispose();
});

function heightSite(): OversailSite {
    return {
        boundary: {
            polygon: [
                { x: -1000, y: -1000 },
                { x: 1000, y: -1000 },
                { x: 1000, y: 1000 },
                { x: -1000, y: 1000 },
            ],
            source: "test boundary",
        },
        neighbours: [],
        noGoZones: [],
        buildings: [
            { id: "tower_a", label: "TOWER A  G+24  75.0 m", heightM: 75 },
            { id: "podium", label: "PODIUM  2 levels  9.0 m", heightM: 9 },
        ],
    };
}

test("height section requires 77 m and lists tie-ins for Tower A 75 m with a 9 m podium", () => {
    // Hand-worked: Tower A 75 m + INDICATIVE 2 m clearance = 77 m required.
    // The podium is a separate 9 m roof, not additive, so 84 m/86 m must not appear.
    // Freestanding 50 m < 77 m -> ties at 50 m and 70 m (20 m INDICATIVE spacing).
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel, content } = showPanel(view, heightSite());

    const hook = content.querySelector('[data-height-id="hook_height"]');
    expect(hook).not.toBeNull();
    expect(hook?.getAttribute("data-height-status")).toBe("pass");
    expect(hook?.textContent).toContain("77.0 m required");
    expect(hook?.textContent).not.toContain("84.0 m required");
    expect(hook?.textContent).not.toContain("86.0 m required");

    const freestanding = content.querySelector('[data-height-id="freestanding"]');
    expect(freestanding).not.toBeNull();
    expect(freestanding?.getAttribute("data-height-status")).toBe("tie_in_required");
    expect(freestanding?.textContent).toContain("50.0 m is below the required 77.0 m");

    const tieIn = content.querySelector('[data-height-id="tie_in"]');
    expect(tieIn).not.toBeNull();
    expect(tieIn?.getAttribute("data-height-status")).toBe("tie_in_required");
    expect(tieIn?.textContent).toContain("Tie-in required at 2 level(s): 50.0, 70.0 m above ground");
    expect(content.textContent).toContain("Overall: TIE-IN REQUIRED");
    panel.dispose();
});

test("height section updates live and reports invalid height input without clearing placement", () => {
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel, content } = showPanel(view, heightSite());

    setInput(content, "Hook clearance", "0");
    expect(content.querySelector('[data-height-id="hook_height"]')?.textContent).toContain("75.0 m required");

    setInput(content, "Freestanding height", "80");
    expect(content.querySelector('[data-height-id="tie_in"]')?.getAttribute("data-height-status")).toBe(
        "pass",
    );
    expect(content.querySelector('[data-height-id="tie_in"]')?.textContent).toContain(
        "No tie-in levels required",
    );

    setInput(content, "Hook clearance", "6");
    expect(content.querySelector('[data-height-id="hook_height"]')?.getAttribute("data-height-status")).toBe(
        "fail",
    );
    expect(content.querySelector('[data-height-id="hook_height"]')?.textContent).toContain(
        "Hook height short by 1.0 m",
    );

    setInput(content, "Tie-in spacing", "0");
    expect(content.textContent).toContain("Tie-in spacing must be greater than 0 m.");
    expect(content.querySelectorAll("[data-height-id]")).toHaveLength(0);
    expect(resultValue(content, "Mast")).toBe("(0.00, 0.00) m");
    panel.dispose();
});

test("height section shows unavailable when the site supplies no building heights", () => {
    const dom = createDom();
    const view = createMockView({ dom } as Partial<IView>);
    const { panel, content } = showPanel(view);

    expect(content.textContent).toContain("Building height unavailable");
    expect(content.textContent).toContain("UNAVAILABLE");
    expect(content.textContent).toContain("height check was not performed.");
    expect(content.querySelectorAll("[data-height-id]")).toHaveLength(0);
    panel.dispose();
});
