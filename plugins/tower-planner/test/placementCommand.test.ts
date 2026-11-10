// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { PubSub, type PubSubEventMap } from "@chili3d/core";
import { createMockApplication, createMockView, TestDocument } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";
import { writeSiteSource } from "../../site-model/src/siteSelection";
import { PlaceTowerCraneCommand } from "../src/commands/placeCrane";

const sampleDxf = readFileSync(
    path.resolve(import.meta.dirname, "../../../public/sample-site/sample-site.dxf"),
    "utf-8",
);

/**
 * Site B for the project-switching tests: the sample site translated +100 m in x and
 * y inside the DXF text itself (every group 10/20/11/21 value). Same buildings, same
 * rules, different coordinates — so a panel that shows Site B's numbers cannot be
 * showing cached or hardcoded Site A data.
 *
 * HAND CHECK (Site B): the school's south edge moves from y = 78 m to y = 178 m and
 * the plot from [0,90]x[0,72] to [100,190]x[100,172]. From mast (30,40):
 *   - nearest school point is (30,178) -> 138 m away > 40 m jib -> school check PASSes
 *     (with Site A the same mast oversails the school by 40 - 38 = 2.0 m and fails);
 *   - the mast is outside the shifted plot -> boundary check fails with
 *     "Mast is outside the site boundary".
 */
function shiftDxfCoordinates(dxfText: string, offset: number): string {
    const lines = dxfText.split(/\r?\n/);
    const coordCodes = new Set(["10", "20", "11", "21"]);
    for (let i = 0; i < lines.length - 1; i++) {
        if (coordCodes.has(lines[i].trim())) {
            const val = parseFloat(lines[i + 1].trim());
            if (!Number.isNaN(val)) {
                lines[i + 1] = (val + offset).toFixed(4);
            }
        }
    }
    return lines.join("\n");
}

const shiftedDxf = shiftDxfCoordinates(sampleDxf, 100);

type FloatPanelOptions = Parameters<PubSubEventMap["showFloatPanel"]>[0];

function createDom(): HTMLElement {
    const dom = document.createElement("div");
    dom.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect;
    dom.setPointerCapture = rs.fn();
    dom.hasPointerCapture = rs.fn(() => false);
    dom.releasePointerCapture = rs.fn();
    return dom;
}

/**
 * A view over its own document, with an optional site DXF selected for that
 * document through the site-model plugin's per-project storage API.
 */
function createSiteView(dxfText?: string, siteName = "site.dxf") {
    const document = new TestDocument();
    if (dxfText !== undefined) {
        const written = writeSiteSource(document, { kind: "dxfText", name: siteName, dxfText });
        if (!written.isOk) throw new Error(written.error);
    }
    const view = createMockView({ dom: createDom(), document } as never);
    return { view, document };
}

function createApplication(dxfText?: string) {
    const { view, document } = createSiteView(dxfText);
    const application = createMockApplication();
    application.activeView = view;
    return { application, view, document };
}

/** Track every panel the command publishes, in order. */
function trackPanels(): FloatPanelOptions[] {
    const panels: FloatPanelOptions[] = [];
    const handler: PubSubEventMap["showFloatPanel"] = (options) => {
        panels.push(options);
    };
    PubSub.default.sub("showFloatPanel", handler);
    return panels;
}

/** A fetch spy proving the command never reaches for the network. */
function stubFetch(): ReturnType<typeof rs.fn> {
    const fetchStub = rs.fn(async () => ({}));
    rs.stubGlobal("fetch", fetchStub);
    return fetchStub;
}

function captureToasts() {
    const calls: unknown[][] = [];
    const handler: PubSubEventMap["showToast"] = (...args: unknown[]) => {
        calls.push(args);
    };
    PubSub.default.sub("showToast", handler as PubSubEventMap["showToast"]);
    return calls;
}

function fieldInput(content: HTMLElement, label: string): HTMLInputElement {
    const labelElement = [...content.querySelectorAll("span")].find((span) => span.textContent === label);
    if (!labelElement) throw new Error(`missing field label: ${label}`);
    const input = labelElement.parentElement?.parentElement?.querySelector("input");
    if (!input) throw new Error(`missing input for: ${label}`);
    return input;
}

function setInput(content: HTMLElement, label: string, value: string) {
    const input = fieldInput(content, label);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
    PubSub.default.removeAll("showFloatPanel");
    PubSub.default.removeAll("showToast");
    PubSub.default.removeAll("documentClosed");
    PubSub.default.removeAll("viewClosed");
    PubSub.default.removeAll("activeViewChanged");
    rs.unstubAllGlobals();
    rs.restoreAllMocks();
});

test("project A loads its selected Site A and reports T8 school oversail and T9 77 m/tie-ins", async () => {
    const fetchStub = stubFetch();
    const { application, view } = createApplication(sampleDxf);
    const panels = trackPanels();
    const removeMesh = rs.spyOn(view.document.visual.context, "removeMesh");

    await new PlaceTowerCraneCommand().execute(application);
    expect(panels).toHaveLength(1);
    const content = panels[0].content;

    // The site came from the project's stored selection, not from the network:
    // the production command must never fetch sample-site/sample-site.dxf.
    expect(fetchStub).not.toHaveBeenCalled();

    // Hand-worked T8: mast (30,40), max hook radius 40 m, school south edge y = 78.
    // Nearest point (30,78) -> distance 38 m -> oversail 40 - 38 = 2.0 m, no oversail permitted.
    setInput(content, "Mast X", "30");
    setInput(content, "Mast Y", "40");

    const school = content.querySelector('[data-check-id="neighbour:nb_north"]');
    expect(school).not.toBeNull();
    expect(school?.getAttribute("data-check-status")).toBe("fail");
    expect(school?.textContent).toContain("Jib oversails the school by 2.0 m, no oversail permitted");

    // Hand-worked T9: Tower A roof 75 m + 2 m clearance = 77 m required.
    // 80 m hook height passes; freestanding 50 m < 77 m needs ties at 50 m and 70 m.
    const hook = content.querySelector('[data-height-id="hook_height"]');
    expect(hook?.getAttribute("data-height-status")).toBe("pass");
    expect(hook?.textContent).toContain("77.0 m required");

    const tieIn = content.querySelector('[data-height-id="tie_in"]');
    expect(tieIn?.getAttribute("data-height-status")).toBe("tie_in_required");
    expect(tieIn?.textContent).toContain("Tie-in required at 2 level(s): 50.0, 70.0 m above ground");

    removeMesh.mockClear();
    panels[0].onClose?.();
    expect(removeMesh).toHaveBeenCalledTimes(6);
});

test("project B loads its own Site B instead of Site A", async () => {
    const fetchStub = stubFetch();
    const { application } = createApplication(shiftedDxf);
    const panels = trackPanels();

    await new PlaceTowerCraneCommand().execute(application);
    expect(panels).toHaveLength(1);
    const content = panels[0].content;

    expect(fetchStub).not.toHaveBeenCalled();

    // Same mast as the Site A test — the shifted school is 138 m away, so the
    // check that failed with Site A's data now passes (see shiftDxfCoordinates).
    setInput(content, "Mast X", "30");
    setInput(content, "Mast Y", "40");

    const school = content.querySelector('[data-check-id="neighbour:nb_north"]');
    expect(school).not.toBeNull();
    expect(school?.getAttribute("data-check-status")).toBe("pass");
    expect(school?.textContent).toContain("No oversail of the school");
    expect(school?.textContent).not.toContain("oversails the school by 2.0 m");

    // The mast sits outside Site B's shifted plot, reported against Site B's boundary.
    const boundary = content.querySelector('[data-check-id="boundary"]');
    expect(boundary).not.toBeNull();
    expect(boundary?.getAttribute("data-check-status")).toBe("fail");
    expect(boundary?.textContent).toContain("Mast is outside the site boundary");

    panels[0].onClose?.();
});

test("switching the active project disposes the Site A panel and plans against Site B", async () => {
    const { view: viewA } = createSiteView(sampleDxf);
    const { view: viewB } = createSiteView(shiftedDxf);
    const application = createMockApplication();
    application.activeView = viewA;
    const panels = trackPanels();
    const removeMeshA = rs.spyOn(viewA.document.visual.context, "removeMesh");

    await new PlaceTowerCraneCommand().execute(application);
    expect(panels).toHaveLength(1);
    setInput(panels[0].content, "Mast X", "30");
    setInput(panels[0].content, "Mast Y", "40");
    expect(
        panels[0].content
            .querySelector('[data-check-id="neighbour:nb_north"]')
            ?.getAttribute("data-check-status"),
    ).toBe("fail");

    // Switching the active project (the real Application publishes this event when
    // activeView is reassigned) disposes the Site A overlay by itself. Input
    // redraws also remove meshes, so clear the spy to count only the dispose.
    removeMeshA.mockClear();
    application.activeView = viewB;
    PubSub.default.pub("activeViewChanged", viewB);
    expect(removeMeshA).toHaveBeenCalledTimes(6);

    await new PlaceTowerCraneCommand().execute(application);
    expect(panels).toHaveLength(2);
    const content = panels[1].content;
    setInput(content, "Mast X", "30");
    setInput(content, "Mast Y", "40");
    expect(
        content.querySelector('[data-check-id="neighbour:nb_north"]')?.getAttribute("data-check-status"),
    ).toBe("pass");
    expect(content.querySelector('[data-check-id="boundary"]')?.getAttribute("data-check-status")).toBe(
        "fail",
    );
    expect(content.textContent).not.toContain("oversails the school by 2.0 m");

    panels[1].onClose?.();
});

test("a project without a selected site shows the no-site toast and UNAVAILABLE, never a clearance PASS", async () => {
    const fetchStub = stubFetch();
    const { application } = createApplication();
    const panels = trackPanels();
    const toasts = captureToasts();

    await new PlaceTowerCraneCommand().execute(application);
    expect(panels).toHaveLength(1);
    const content = panels[0].content;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[0]).toBe("towerplanner.site.noActiveSite");
    expect(toasts[0]?.[1]).toBe("test");

    // No silent fallback to the fixed sample URL, and no fabricated site.
    expect(fetchStub).not.toHaveBeenCalled();
    expect(content.textContent).toContain("Site data unavailable");
    expect(content.textContent).toContain("Clearance checks were not performed");
    expect(content.textContent).toContain("UNAVAILABLE");
    expect(content.textContent).not.toContain("Overall: PASS");
    expect(content.querySelectorAll("[data-check-id]")).toHaveLength(0);
    expect(content.querySelectorAll("[data-height-id]")).toHaveLength(0);

    panels[0].onClose?.();
});

test("invalid site data shows the site-unavailable error and never reports a clearance PASS", async () => {
    const { application } = createApplication("not a dxf");
    const panels = trackPanels();
    const toasts = captureToasts();

    await new PlaceTowerCraneCommand().execute(application);
    expect(panels).toHaveLength(1);
    const content = panels[0].content;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[0]).toBe("towerplanner.site.unavailable");
    expect(String(toasts[0]?.[1])).toContain("DXF");

    expect(content.textContent).toContain("Site data unavailable");
    expect(content.textContent).toContain("Clearance checks were not performed");
    expect(content.textContent).toContain("UNAVAILABLE");
    expect(content.textContent).not.toContain("Overall: PASS");
    expect(content.querySelectorAll("[data-check-id]")).toHaveLength(0);
    expect(content.querySelectorAll("[data-height-id]")).toHaveLength(0);

    panels[0].onClose?.();
});

test("a malformed stored site selection is reported as unavailable, not fabricated", async () => {
    const { application, document } = createApplication();
    document.userData = { siteSource: 42 };
    const panels = trackPanels();
    const toasts = captureToasts();

    await new PlaceTowerCraneCommand().execute(application);
    expect(panels).toHaveLength(1);
    const content = panels[0].content;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[0]).toBe("towerplanner.site.unavailable");
    expect(String(toasts[0]?.[1])).toContain("invalid");

    expect(content.textContent).toContain("Site data unavailable");
    expect(content.querySelectorAll("[data-check-id]")).toHaveLength(0);
    expect(content.querySelectorAll("[data-height-id]")).toHaveLength(0);

    panels[0].onClose?.();
});

test("with no active view the command shows the no-document toast and opens no panel", async () => {
    const application = createMockApplication();
    application.activeView = undefined;
    const panels = trackPanels();
    const toasts = captureToasts();

    await new PlaceTowerCraneCommand().execute(application);

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[0]).toBe("toast.document.noActivated");
    expect(panels).toHaveLength(0);
});
