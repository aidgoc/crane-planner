// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type DialogButton, I18n, type I18nKeys, type IApplication, PubSub } from "@chili3d/core";
import { createMockApplication, createMockView, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, rs, test } from "@rstest/core";
import type { ReportData } from "../../site-model/src/report";
import { REQUIRED_DISCLAIMER } from "../../site-model/src/types";
import { MCT88 } from "../src/catalogue";
import { TowerPickReportCommand } from "../src/commands/towerPickReport";
import { en } from "../src/i18n/en";
import type { CraneEvaluation, Pick, PickEvaluation } from "../src/pickEngine";
import {
    capturePickCheckSession,
    type PickCheckSessionDraft,
    readPickCheckSession,
} from "../src/report/towerPickSession";

/*
 * HAND-WORKED SANITY CHECK (fixture values, not catalogue data):
 *
 * The captured P1 is a 2 t load at a 20 m radius with a supplied capacity of
 * 99.9 t, i.e. a supplied utilisation of 2.0%. A report that recalculated the
 * chart would not print 99.9 t, so the report text is the evidence that the
 * captured evaluation was copied unchanged.
 */

/** Temporarily install the plugin's real English strings for a text assertion. */
function installEnglishLocale(): () => void {
    const previous = I18n.getLanguages().find((locale) => locale.language === "en");
    I18n.addLanguage(en);
    return () => {
        if (previous !== undefined) {
            I18n.addLanguage(previous);
        } else {
            I18n.removeLanguage("en");
        }
    };
}

type DialogCapture = {
    readonly title: I18nKeys;
    readonly content: HTMLElement;
    readonly buttons: readonly DialogButton[];
};

type Recorder = {
    readonly toasts: I18nKeys[];
    readonly dialog: DialogCapture | undefined;
    dispose(): void;
};

function createRecorder(): Recorder {
    const toasts: I18nKeys[] = [];
    let dialog: DialogCapture | undefined;

    const onToast = (message: I18nKeys) => {
        toasts.push(message);
    };
    const onDialog = (title: I18nKeys, content: HTMLElement, buttons?: DialogButton[] | (() => void)) => {
        if (Array.isArray(buttons)) {
            dialog = { title, content, buttons };
        }
    };

    PubSub.default.sub("showToast", onToast);
    PubSub.default.sub("showDialog", onDialog);

    return {
        toasts,
        get dialog() {
            return dialog;
        },
        dispose() {
            PubSub.default.remove("showToast", onToast);
            PubSub.default.remove("showDialog", onDialog);
        },
    };
}

function requireDialog(recorder: Recorder): DialogCapture {
    if (recorder.dialog === undefined) throw new Error("Command did not publish a dialog.");
    return recorder.dialog;
}

function inputByRole(content: HTMLElement, role: string): HTMLInputElement {
    const element = content.querySelector<HTMLInputElement>(`input[data-role="${role}"]`);
    if (element === null) throw new Error(`Input [data-role="${role}"] is missing.`);
    return element;
}

function errorText(content: HTMLElement): string {
    const element = content.querySelector('[data-role="report-metadata-error"]');
    if (element === null) throw new Error("Report metadata error line is missing.");
    return element.textContent ?? "";
}

function findButton(buttons: readonly DialogButton[], content: I18nKeys): DialogButton {
    const button = buttons.find((candidate) => candidate.content === content);
    if (button === undefined) throw new Error(`Dialog button '${String(content)}' is missing.`);
    return button;
}

async function confirm(buttons: readonly DialogButton[]): Promise<boolean> {
    const button = findButton(buttons, "common.confirm" as I18nKeys);
    const shouldClose = button.shouldClose?.() ?? true;
    if (!shouldClose) return false;
    await button.onclick?.();
    return true;
}

const PICK: Pick = {
    label: "P1",
    loadT: 2,
    supply: { x: 20, y: 0 },
    drop: { x: 0, y: 20 },
};

const PICK_EVALUATION: PickEvaluation = {
    craneId: MCT88.id,
    craneName: MCT88.name,
    label: "P1",
    jibM: MCT88.defaultJibM.value,
    loadT: 2,
    radiusM: 20,
    supplyRadiusM: 20,
    dropRadiusM: 20,
    governing: "supply",
    windKmh: null,
    capacityT: 99.9,
    utilisationPct: 2,
    status: "PASS",
};

const EVALUATION: CraneEvaluation = {
    craneId: MCT88.id,
    craneName: MCT88.name,
    jibM: MCT88.defaultJibM.value,
    windKmh: null,
    picks: [PICK_EVALUATION],
    allPass: true,
    failedCount: 0,
    unsupported: false,
};

function draft(): PickCheckSessionDraft {
    return {
        crane: MCT88,
        jibM: MCT88.defaultJibM.value,
        windKmh: null,
        mast: { x: 0, y: 0 },
        picks: [PICK],
        evaluation: EVALUATION,
    };
}

function captureSession(document: TestDocument): void {
    if (capturePickCheckSession(document, draft()) === undefined) {
        throw new Error("The test fixture session was not captured.");
    }
}

function applicationFor(document: TestDocument): IApplication {
    const application = createMockApplication();
    application.activeView = createMockView({ document });
    return application;
}

function fakePrintWindow() {
    const write = rs.fn((_html: string) => {});
    const target = {
        document: {
            open: rs.fn(),
            write,
            close: rs.fn(),
        },
    } as unknown as Window;
    return { target, write };
}

function fillMetadata(content: HTMLElement, values: { author?: string; date?: string; site?: string }): void {
    if (values.author !== undefined) inputByRole(content, "report-author").value = values.author;
    if (values.date !== undefined) inputByRole(content, "report-date").value = values.date;
    if (values.site !== undefined) inputByRole(content, "report-site").value = values.site;
}

class InvalidReportCommand extends TowerPickReportCommand {
    protected override buildReport(): ReportData {
        throw new RangeError("Synthetic invalid report data");
    }
}

describe("TowerPickReportCommand guards", () => {
    test("refuses to open a dialog when no document is active", async () => {
        const recorder = createRecorder();
        const open = rs.spyOn(window, "open").mockReturnValue(null);
        try {
            await new TowerPickReportCommand().execute(createMockApplication());

            expect(recorder.toasts).toContain("tower.report.noDocument" as I18nKeys);
            expect(recorder.dialog).toBeUndefined();
            expect(open).not.toHaveBeenCalled();
        } finally {
            open.mockRestore();
            recorder.dispose();
        }
    });

    test("refuses to report a document that has no captured session", async () => {
        const document = new TestDocument();
        document.name = "No Session";
        const recorder = createRecorder();
        const open = rs.spyOn(window, "open").mockReturnValue(null);
        try {
            await new TowerPickReportCommand().execute(applicationFor(document));

            expect(recorder.toasts).toContain("tower.report.noSession" as I18nKeys);
            expect(recorder.dialog).toBeUndefined();
            expect(open).not.toHaveBeenCalled();
        } finally {
            open.mockRestore();
            recorder.dispose();
        }
    });

    test("retrieves the session for the exact active document only", async () => {
        const first = new TestDocument();
        first.name = "Project A";
        const second = new TestDocument();
        second.name = "Project B";
        captureSession(first);
        const captured = readPickCheckSession(first);

        const recorder = createRecorder();
        try {
            await new TowerPickReportCommand().execute(applicationFor(second));
            expect(recorder.toasts).toContain("tower.report.noSession" as I18nKeys);
            expect(recorder.dialog).toBeUndefined();
            expect(readPickCheckSession(first)).toEqual(captured);

            await new TowerPickReportCommand().execute(applicationFor(first));
            const dialog = requireDialog(recorder);
            expect(dialog.title).toBe("tower.report.title" as I18nKeys);
            expect(inputByRole(dialog.content, "report-project").value).toBe("Project A");
        } finally {
            recorder.dispose();
        }
    });
});

describe("TowerPickReportCommand metadata dialog", () => {
    test("derives the project name and collects author, date and site location", async () => {
        const document = new TestDocument();
        document.name = "Harbour Project";
        captureSession(document);
        const recorder = createRecorder();
        const restore = installEnglishLocale();
        const open = rs.spyOn(window, "open");
        const print = fakePrintWindow();
        open.mockReturnValue(print.target);

        try {
            await new TowerPickReportCommand().execute(applicationFor(document));
            const dialog = requireDialog(recorder);

            expect(inputByRole(dialog.content, "report-project").value).toBe("Harbour Project");
            expect(inputByRole(dialog.content, "report-author").value).toBe("");
            expect(inputByRole(dialog.content, "report-date").value).toBe("");
            expect(inputByRole(dialog.content, "report-site").value).toBe("");
            expect(dialog.content.textContent).toContain(REQUIRED_DISCLAIMER);
            expect(dialog.content.textContent).toContain("Captured crane: Potain MCT 88");

            fillMetadata(dialog.content, {
                author: "Test Engineer",
                date: "2026-11-16",
                site: "North Quay",
            });
            expect(await confirm(dialog.buttons)).toBe(true);

            expect(open).toHaveBeenCalledWith("", "_blank");
            expect(print.write).toHaveBeenCalledTimes(1);
            const html = print.write.mock.calls[0][0];
            expect(html).toContain(REQUIRED_DISCLAIMER);
            expect(html).toContain("Harbour Project");
            expect(html).toContain("Test Engineer");
            expect(html).toContain("2026-11-16");
            expect(html).toContain("North Quay");
            // The captured evaluation used 99.9 t; a recalculation would not print it.
            expect(html).toContain("99.9");
        } finally {
            open.mockRestore();
            recorder.dispose();
            restore();
        }
    });

    test("keeps the dialog open and does not open a window when metadata is invalid", async () => {
        const document = new TestDocument();
        document.name = "Harbour Project";
        captureSession(document);
        const recorder = createRecorder();
        const restore = installEnglishLocale();
        const open = rs.spyOn(window, "open").mockReturnValue(null);

        try {
            await new TowerPickReportCommand().execute(applicationFor(document));
            const dialog = requireDialog(recorder);

            expect(await confirm(dialog.buttons)).toBe(false);
            expect(errorText(dialog.content)).toContain("Enter an author");
            expect(open).not.toHaveBeenCalled();

            fillMetadata(dialog.content, { author: "Test Engineer" });
            expect(await confirm(dialog.buttons)).toBe(false);
            expect(errorText(dialog.content)).toContain("Enter a real date");
            expect(open).not.toHaveBeenCalled();

            fillMetadata(dialog.content, { date: "2026-11-16" });
            expect(await confirm(dialog.buttons)).toBe(true);
            expect(open).toHaveBeenCalledTimes(1);
        } finally {
            open.mockRestore();
            recorder.dispose();
            restore();
        }
    });

    test("cancels without opening a window or changing the captured session", async () => {
        const document = new TestDocument();
        document.name = "Harbour Project";
        captureSession(document);
        const captured = readPickCheckSession(document);
        const recorder = createRecorder();
        const open = rs.spyOn(window, "open").mockReturnValue(null);

        try {
            await new TowerPickReportCommand().execute(applicationFor(document));
            const dialog = requireDialog(recorder);
            fillMetadata(dialog.content, { author: "Test Engineer", date: "2026-11-16" });

            const cancel = findButton(dialog.buttons, "common.cancel" as I18nKeys);
            await cancel.onclick?.();

            expect(open).not.toHaveBeenCalled();
            expect(readPickCheckSession(document)).toEqual(captured);
            expect(recorder.toasts).toEqual([]);
        } finally {
            open.mockRestore();
            recorder.dispose();
        }
    });

    test("does not claim a report was generated when the popup is blocked", async () => {
        const document = new TestDocument();
        document.name = "Harbour Project";
        captureSession(document);
        const recorder = createRecorder();
        const open = rs.spyOn(window, "open").mockReturnValue(null);

        try {
            await new TowerPickReportCommand().execute(applicationFor(document));
            const dialog = requireDialog(recorder);
            fillMetadata(dialog.content, { author: "Test Engineer", date: "2026-11-16" });

            expect(await confirm(dialog.buttons)).toBe(true);
            expect(open).toHaveBeenCalledTimes(1);
            expect(recorder.toasts).toContain("tower.report.blocked" as I18nKeys);
        } finally {
            open.mockRestore();
            recorder.dispose();
        }
    });

    test("shows an error and opens no window when report data cannot be built", async () => {
        const document = new TestDocument();
        document.name = "Harbour Project";
        captureSession(document);
        const recorder = createRecorder();
        const restore = installEnglishLocale();
        const open = rs.spyOn(window, "open").mockReturnValue(null);

        try {
            await new InvalidReportCommand().execute(applicationFor(document));
            const dialog = requireDialog(recorder);
            fillMetadata(dialog.content, { author: "Test Engineer", date: "2026-11-16" });

            expect(await confirm(dialog.buttons)).toBe(false);
            expect(errorText(dialog.content)).toContain("Synthetic invalid report data");
            expect(errorText(dialog.content)).toContain("No report was generated");
            expect(open).not.toHaveBeenCalled();
        } finally {
            open.mockRestore();
            recorder.dispose();
            restore();
        }
    });
});
