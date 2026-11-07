// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { type I18nKeys, PubSub, type PubSubEventMap } from "@chili3d/core";
import { createMockApplication, createMockView } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";
import { PlaceTowerCraneCommand } from "../src/commands/placeCrane";

const sampleDxf = readFileSync(
    path.resolve(import.meta.dirname, "../../../public/sample-site/sample-site.dxf"),
    "utf-8",
);

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

function capturePanel(): () => FloatPanelOptions {
    let options: FloatPanelOptions | undefined;
    const handler: PubSubEventMap["showFloatPanel"] = (value) => {
        options = value;
    };
    PubSub.default.sub("showFloatPanel", handler);
    return () => {
        PubSub.default.remove("showFloatPanel", handler);
        if (!options) throw new Error("command did not publish panel content");
        return options;
    };
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

function stubFetch(response: { ok: boolean; status?: number; text?: () => Promise<string> }) {
    const fetchStub = rs.fn(async () => ({
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 500),
        text: response.text ?? (async () => ""),
    }));
    rs.stubGlobal("fetch", fetchStub);
    return fetchStub;
}

function createApplication() {
    const dom = createDom();
    const view = createMockView({ dom } as never);
    const application = createMockApplication();
    application.activeView = view;
    return { application, view };
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

test("command loads the shared sample site and reports T8 school oversail and T9 77 m/tie-ins", async () => {
    const fetchStub = stubFetch({ ok: true, text: async () => sampleDxf });
    const { application, view } = createApplication();
    const finish = capturePanel();
    const removeMesh = rs.spyOn(view.document.visual.context, "removeMesh");

    await new PlaceTowerCraneCommand().execute(application);
    const options = finish();
    const content = options.content;

    expect(fetchStub).toHaveBeenCalledWith("sample-site/sample-site.dxf");

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
    options.onClose?.();
    expect(removeMesh).toHaveBeenCalledTimes(6);
});

test("invalid site data shows the site-unavailable error and never reports a clearance PASS", async () => {
    stubFetch({ ok: true, text: async () => "not a dxf" });
    const { application } = createApplication();
    const finish = capturePanel();
    const toast = rs.fn();
    PubSub.default.sub("showToast", toast as PubSubEventMap["showToast"]);

    await new PlaceTowerCraneCommand().execute(application);
    const content = finish().content;

    expect(toast).toHaveBeenCalledWith(
        "towerplanner.site.unavailable" as I18nKeys,
        expect.stringContaining("DXF"),
    );
    expect(content.textContent).toContain("Site data unavailable");
    expect(content.textContent).toContain("Clearance checks were not performed");
    expect(content.textContent).toContain("UNAVAILABLE");
    expect(content.textContent).not.toContain("Overall: PASS");
    expect(content.querySelectorAll("[data-check-id]")).toHaveLength(0);
    expect(content.querySelectorAll("[data-height-id]")).toHaveLength(0);
});

test("a missing site response is reported and cannot produce a successful clearance result", async () => {
    stubFetch({ ok: false, status: 404 });
    const { application } = createApplication();
    const finish = capturePanel();
    const toast = rs.fn();
    PubSub.default.sub("showToast", toast as PubSubEventMap["showToast"]);

    await new PlaceTowerCraneCommand().execute(application);
    const content = finish().content;

    expect(toast).toHaveBeenCalledWith(
        "towerplanner.site.unavailable" as I18nKeys,
        expect.stringContaining("HTTP 404"),
    );
    expect(content.textContent).toContain("Site data unavailable");
    expect(content.querySelectorAll("[data-check-id]")).toHaveLength(0);
    expect(content.querySelectorAll("[data-height-id]")).toHaveLength(0);
});
