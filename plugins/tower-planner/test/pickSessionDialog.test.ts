// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type I18nKeys, type IApplication, PubSub } from "@chili3d/core";
import { createMockApplication, createMockView, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { MCT85F5, MCT88 } from "../src/catalogue";
import { TowerPickCheckCommand } from "../src/command";
import { readPickCheckSession } from "../src/report/towerPickSession";

/*
 * HAND-WORKED SANITY CHECK (sample-site fixture, not a new calculation):
 *
 * The sample P1 supply is (26, 5.5) m and its drop is (62, 39) m. With the mast
 * at the origin the drop radius is hypot(62, 39) = 73.24 m. That is outside the
 * MCT 88's published 52 m jib range, so P1 is OUT_OF_RANGE, not INVALID. The
 * remaining sample picks have even larger governing radii. Capture must accept
 * these evaluated OUT_OF_RANGE outcomes while still rejecting an all-INVALID
 * default evaluation with no mast.
 */

async function openPickDialog(application: IApplication): Promise<HTMLElement> {
    let content: HTMLElement | undefined;

    const onDialog = (_title: I18nKeys, dialogContent: HTMLElement) => {
        content = dialogContent;
    };

    PubSub.default.sub("showDialog", onDialog);
    try {
        await new TowerPickCheckCommand().execute(application);
    } finally {
        PubSub.default.removeAll("showDialog");
    }

    if (content === undefined) throw new Error("Command did not publish dialog content.");
    return content;
}

function createApplication(document: TestDocument): IApplication {
    const application = createMockApplication();
    application.activeView = createMockView({ document });
    return application;
}

function findInput(content: HTMLElement, role: string): HTMLInputElement {
    const element = content.querySelector<HTMLInputElement>(`input[data-role="${role}"]`);
    if (element === null) throw new Error(`Input [data-role="${role}"] is missing.`);
    return element;
}

function enterInput(content: HTMLElement, role: string, value: string): void {
    const element = findInput(content, role);
    element.value = value;
    element.dispatchEvent(new Event("input"));
}

function rowInput(content: HTMLElement, pickLabel: string, role: string): HTMLInputElement {
    const row = content.querySelector<HTMLTableRowElement>(`tbody tr[data-pick="${pickLabel}"]`);
    if (row === null) throw new Error(`Pick row ${pickLabel} is missing.`);
    const element = row.querySelector<HTMLInputElement>(`input[data-role="${role}"]`);
    if (element === null) throw new Error(`Input [data-role="${role}"] in ${pickLabel} is missing.`);
    return element;
}

function enterRowInput(content: HTMLElement, pickLabel: string, role: string, value: string): void {
    const element = rowInput(content, pickLabel, role);
    element.value = value;
    element.dispatchEvent(new Event("input"));
}

function captureButton(content: HTMLElement): HTMLButtonElement {
    const element = content.querySelector<HTMLButtonElement>('button[data-role="capture-session"]');
    if (element === null) throw new Error("Capture for report button is missing.");
    return element;
}

function captureStatus(content: HTMLElement): string {
    const element = content.querySelector('[data-role="capture-status"]');
    return element?.textContent ?? "";
}

function capture(content: HTMLElement): void {
    captureButton(content).click();
}

function enterValidMast(content: HTMLElement): void {
    enterInput(content, "mast-x", "0");
    enterInput(content, "mast-y", "0");
}

function selectCrane(content: HTMLElement, craneId: string): void {
    const element = content.querySelector<HTMLSelectElement>("select");
    if (element === null) throw new Error("Crane selector is missing.");
    element.value = craneId;
    element.dispatchEvent(new Event("change"));
}

describe("TowerPickCheckCommand session lifecycle", () => {
    test("does not create a session when opened or initially recalculated", async () => {
        const document = new TestDocument();
        const content = await openPickDialog(createApplication(document));

        expect(readPickCheckSession(document)).toBeUndefined();
        expect(captureStatus(content)).toContain("Not captured");
        expect(captureButton(content).disabled).toBe(false);
    });

    test("rejects the default all-INVALID evaluation, then captures valid inputs", async () => {
        const document = new TestDocument();
        const content = await openPickDialog(createApplication(document));

        capture(content);
        expect(readPickCheckSession(document)).toBeUndefined();
        expect(captureStatus(content)).toContain("Not captured");
        expect(captureStatus(content)).toContain("mast");

        enterValidMast(content);
        expect(captureStatus(content)).toContain("Not captured");

        capture(content);
        const session = readPickCheckSession(document);
        expect(session).not.toBeUndefined();
        expect(session?.crane.id).toBe(MCT88.id);
        expect(session?.evaluation.craneId).toBe(MCT88.id);
        expect(session?.evaluation.picks.every((pick) => pick.status !== "INVALID")).toBe(true);
        expect(captureStatus(content)).toContain("Captured for report.");
    });

    test("restores a captured session when the same document is reopened", async () => {
        const document = new TestDocument();
        const application = createApplication(document);
        const first = await openPickDialog(application);

        enterInput(first, "mast-x", "2");
        enterInput(first, "mast-y", "3");
        enterInput(first, "jib", "35");
        enterInput(first, "wind", "12");
        enterRowInput(first, "P1", "load", "2.5");
        capture(first);

        const captured = readPickCheckSession(document);
        expect(captured).not.toBeUndefined();
        expect(captured?.jibM.provenance).toEqual({
            kind: "source",
            sourceId: "datasheetOverview",
        });
        const capturedCopy = structuredClone(captured);

        const reopened = await openPickDialog(application);
        expect(findInput(reopened, "mast-x").value).toBe("2");
        expect(findInput(reopened, "mast-y").value).toBe("3");
        expect(findInput(reopened, "jib").value).toBe("35");
        expect(findInput(reopened, "wind").value).toBe("12");
        expect(rowInput(reopened, "P1", "load").value).toBe("2.5");
        expect(captureStatus(reopened)).toContain("Captured for report.");

        // The initial reopening recalculation is display-only: it must not
        // replace the stored session with a newly computed one.
        expect(readPickCheckSession(document)).toEqual(capturedCopy);
    });

    test("does not expose one document's session to another document", async () => {
        const firstDocument = new TestDocument();
        const secondDocument = new TestDocument();
        const first = await openPickDialog(createApplication(firstDocument));

        enterValidMast(first);
        capture(first);
        expect(readPickCheckSession(firstDocument)).not.toBeUndefined();

        const second = await openPickDialog(createApplication(secondDocument));
        expect(readPickCheckSession(secondDocument)).toBeUndefined();
        expect(readPickCheckSession(firstDocument)).not.toBeUndefined();
        expect(findInput(second, "mast-x").value).toBe("");
        expect(findInput(second, "jib").value).toBe(String(MCT88.defaultJibM.value));
        expect(captureStatus(second)).toContain("Not captured");
    });

    test("captures the selected crane's evaluation, not another matrix row", async () => {
        const document = new TestDocument();
        const content = await openPickDialog(createApplication(document));

        selectCrane(content, MCT85F5.id);
        enterValidMast(content);
        capture(content);

        const session = readPickCheckSession(document);
        expect(session?.crane.id).toBe(MCT85F5.id);
        expect(session?.evaluation.craneId).toBe(MCT85F5.id);
        expect(session?.evaluation.picks).toHaveLength(5);
    });

    test("clears the captured session before replaying each relevant input change", async () => {
        const document = new TestDocument();
        const content = await openPickDialog(createApplication(document));
        enterValidMast(content);

        const mutations: (() => void)[] = [
            () => enterInput(content, "jib", "35"),
            () => enterInput(content, "mast-x", "1"),
            () => enterInput(content, "mast-y", "1"),
            () => enterInput(content, "wind", "10"),
            () => enterRowInput(content, "P1", "load", "2.5"),
            () => enterRowInput(content, "P1", "supply-x", "27"),
            () => enterRowInput(content, "P1", "supply-y", "6.5"),
            () => enterRowInput(content, "P1", "drop-x", "63"),
            () => enterRowInput(content, "P1", "drop-y", "40"),
            () => selectCrane(content, MCT85F5.id),
        ];

        for (const mutate of mutations) {
            capture(content);
            expect(readPickCheckSession(document)).not.toBeUndefined();

            mutate();
            expect(readPickCheckSession(document)).toBeUndefined();
            expect(captureStatus(content)).toContain("Not captured");
        }
    });

    test("disables capture with a visible explanation when no document is active", async () => {
        const application = createMockApplication();
        const content = await openPickDialog(application);
        const button = captureButton(content);

        expect(button.disabled).toBe(true);
        expect(captureStatus(content)).toContain(
            "Capture for report is unavailable because no document is active",
        );

        button.click();
        expect(captureStatus(content)).toContain(
            "Capture for report is unavailable because no document is active",
        );

        // The standalone calculator still works; only capture is unavailable.
        enterValidMast(content);
        expect(
            Array.from(content.querySelectorAll("[data-status]")).map((element) =>
                element.getAttribute("data-status"),
            ),
        ).not.toContain("INVALID");
        expect(captureStatus(content)).toContain("unavailable");
    });
});
