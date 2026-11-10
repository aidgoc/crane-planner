// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { PubSub, type PubSubEventMap } from "@chili3d/core";
import { createMockApplication, createMockView, type TestDocument } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import { ImportSiteDxfCommand } from "../src/commands/importSiteDxf";
import { hasSiteSource, readSiteSource, writeSiteSource } from "../src/siteSelection";
import { loadSiteProjectFromDxf } from "../src/siteSource";

const sampleDxf = readFileSync(
    path.resolve(import.meta.dirname, "../../../public/sample-site/sample-site.dxf"),
    "utf-8",
);

/**
 * Capture every showToast publication so assertions run on the published key and
 * arguments, not on translated text (tests run with the identity locale).
 */
function captureToasts() {
    const calls: unknown[][] = [];
    const handler: PubSubEventMap["showToast"] = (...args: unknown[]) => {
        calls.push(args);
    };
    PubSub.default.sub("showToast", handler as PubSubEventMap["showToast"]);
    return calls;
}

/**
 * `readFileAsync` opens a hidden file input in the document and waits for it to
 * settle. Drive that input directly so the import command runs end-to-end without
 * a native file dialog: start the command, then hand it a File through the picker.
 */
function pickFile(content: string, name = "site.dxf") {
    const file = new File([content], name, { type: "application/dxf" });
    return () => {
        const input = document.querySelector("input[type=file]") as HTMLInputElement;
        if (!input) throw new Error("the command did not open a file picker");
        if (input.accept !== ".dxf") throw new Error(`unexpected picker accept: ${input.accept}`);
        Object.defineProperty(input, "files", { value: [file], configurable: true });
        input.dispatchEvent(new Event("change"));
    };
}

function cancelPicker() {
    return () => {
        const input = document.querySelector("input[type=file]") as HTMLInputElement;
        if (!input) throw new Error("the command did not open a file picker");
        input.dispatchEvent(new Event("cancel"));
    };
}
function emptyPicker() {
    return () => {
        const input = document.querySelector("input[type=file]") as HTMLInputElement;
        if (!input) throw new Error("the command did not open a file picker");

        Object.defineProperty(input, "files", {
            value: [],
            configurable: true,
        });
        input.dispatchEvent(new Event("change"));
    };
}

function createApplication() {
    const view = createMockView();
    const application = createMockApplication();
    application.activeView = view;
    return { application, document: view.document as TestDocument };
}

/**
 * happy-dom's FileReader implementation lacks the standard static
 * EMPTY/LOADING/DONE constants that `readFileAsync` uses to detect read
 * completion, so its promise would never settle under the test DOM. Stub in a
 * subclass that only adds those constants; behaviour is inherited unchanged.
 */
beforeEach(() => {
    const happyDomFileReader = globalThis.FileReader;
    class FileReaderWithStandardConstants extends happyDomFileReader {
        static readonly EMPTY = 0;
        static readonly LOADING = 1;
        static readonly DONE = 2;
    }
    rs.stubGlobal("FileReader", FileReaderWithStandardConstants);
});

afterEach(() => {
    PubSub.default.removeAll("showToast");
    rs.unstubAllGlobals();
    rs.restoreAllMocks();
});

test("a valid DXF is parsed, stored and selected for the active document", async () => {
    const { application, document } = createApplication();
    const toasts = captureToasts();
    const drive = pickFile(sampleDxf, "site-a.dxf");

    const executing = new ImportSiteDxfCommand().execute(application);
    drive();
    await executing;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[0]).toBe("sitemodel.import.success");
    expect(toasts[0]?.[1]).toBe("site-a.dxf");

    expect(hasSiteSource(document)).toBe(true);
    const source = readSiteSource(document);
    expect(source.isOk).toBe(true);
    const storedDxfText = source.isOk ? source.value.dxfText : "UNREACHABLE_FALLBACK";
    expect(source.value?.name).toBe("site-a.dxf");
    expect(storedDxfText).toBe(sampleDxf);
    // What was stored still parses: the selection is only ever the validated DXF.
    expect(loadSiteProjectFromDxf(storedDxfText).isOk).toBe(true);
});

test("an invalid DXF is rejected and keeps the previously selected valid site", async () => {
    const { application, document } = createApplication();
    const seeded = writeSiteSource(document, { kind: "dxfText", name: "existing.dxf", dxfText: sampleDxf });
    expect(seeded.isOk).toBe(true);
    const toasts = captureToasts();
    const drive = pickFile("not a dxf", "broken.dxf");

    const executing = new ImportSiteDxfCommand().execute(application);
    drive();
    await executing;

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[0]).toBe("sitemodel.import.failed");
    expect(toasts[0]?.[1]).toBe("broken.dxf");
    expect(String(toasts[0]?.[2])).toContain("DXF");

    // The previously selected site is untouched — no overwrite with broken data.
    const source = readSiteSource(document);
    expect(source.isOk).toBe(true);
    expect(source.value?.name).toBe("existing.dxf");
    expect(source.value?.dxfText).toBe(sampleDxf);
});

test("a cancelled picker leaves the selection untouched and shows no toast", async () => {
    const { application, document } = createApplication();
    const seeded = writeSiteSource(document, { kind: "dxfText", name: "existing.dxf", dxfText: sampleDxf });
    expect(seeded.isOk).toBe(true);
    const toasts = captureToasts();
    const drive = cancelPicker();

    const executing = new ImportSiteDxfCommand().execute(application);
    drive();
    await executing;

    expect(toasts).toHaveLength(0);
    expect(readSiteSource(document).value?.name).toBe("existing.dxf");
});
test("an empty successful picker leaves the selection untouched and shows no toast", async () => {
    const { application, document } = createApplication();

    const seeded = writeSiteSource(document, {
        kind: "dxfText",
        name: "existing.dxf",
        dxfText: sampleDxf,
    });
    expect(seeded.isOk).toBe(true);

    const toasts = captureToasts();
    const drive = emptyPicker();

    const executing = new ImportSiteDxfCommand().execute(application);
    drive();
    await executing;

    expect(toasts).toHaveLength(0);

    const source = readSiteSource(document);
    expect(source.isOk).toBe(true);
    expect(source.value?.name).toBe("existing.dxf");
    expect(source.value?.dxfText).toBe(sampleDxf);
});

test("with no active document the import shows the no-document toast and opens no picker", async () => {
    const application = createMockApplication();
    application.activeView = undefined;
    const toasts = captureToasts();

    await new ImportSiteDxfCommand().execute(application);

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[0]).toBe("toast.document.noActivated");
    expect(document.querySelector("input[type=file]")).toBeNull();
});

test("each import targets only the active document's site selection", async () => {
    // HAND CHECK: selecting a site while Project A is active must not leak into
    // Project B — selections live in per-document userData.
    const { application, document } = createApplication();
    const other = createMockView().document as TestDocument;
    const toasts = captureToasts();
    const drive = pickFile(sampleDxf, "site-a.dxf");

    const executing = new ImportSiteDxfCommand().execute(application);
    drive();
    await executing;

    expect(toasts[0]?.[0]).toBe("sitemodel.import.success");
    expect(hasSiteSource(document)).toBe(true);
    expect(hasSiteSource(other)).toBe(false);
});
