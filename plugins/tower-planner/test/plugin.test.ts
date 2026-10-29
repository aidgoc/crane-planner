// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { I18n, type I18nKeys, type IApplication, PubSub } from "@chili3d/core";
import { getCraneById, MCT85F5, MCT88, TOWER_CRANES } from "../src/catalogue";
import { craneDialogNotes, TowerPickCheckCommand } from "../src/command";
import { PLANNING_DISCLAIMER } from "../src/disclaimer";
import { en } from "../src/i18n/en";
import TowerPlannerPlugin from "../src/index";

const testDir = path.dirname(fileURLToPath(import.meta.url));

/** Temporarily install the plugin's real English strings for a rendering test. */
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

describe("tower-planner plugin wiring", () => {
    test("registers the command, ribbon item and English resources", () => {
        expect(TowerPlannerPlugin.commands).toEqual([TowerPickCheckCommand]);

        const ribbon = TowerPlannerPlugin.ribbons?.[0];
        expect(ribbon?.tabName).toBe("ribbon.tab.plugin");
        expect(ribbon?.groups[0].items).toContain("tower.pick");

        const locale = TowerPlannerPlugin.i18nResources?.[0];
        expect(locale?.language).toBe("en");
        expect(locale?.translation["command.tower.pick"]).toBe("Tower Pick Check");
    });

    test("ships the exact required disclaimer in the plugin guide", () => {
        expect(PLANNING_DISCLAIMER).toBe("Planning aid, not a certified lift plan.");
        expect(TowerPlannerPlugin.guide?.[0].content).toContain(PLANNING_DISCLAIMER);
    });

    test("exposes the MCT 88 with sourced values", () => {
        expect(MCT88.id).toBe("potain-mct-88");
        expect(MCT88.maxCapacityT.value).toBe(5);
        // 52 m is the maximum working jib; 53.1 m is the overall tip length.
        expect(MCT88.maxJibLengthM.value).toBe(52);
        expect(MCT88.tipLoadByJib.at(-1)?.jibM.value).toBe(52);
        expect(MCT88.tipLoadByJib.at(-1)?.tipT.value).toBe(1.15);
        expect(MCT88.tipLoadByJib[2].tipT.value).toBe(2.7);
        expect(MCT88.dimensions.mastWidthM.value).toBe(1.2);
        expect(MCT88.dimensions.mastWidthM.provenance).toEqual({
            kind: "source",
            sourceId: "datasheetOverview",
        });
        expect(MCT88.dimensions.counterJibLengthM.value).toBe(11.9);
        expect(MCT88.heaviestErectionComponent.massT.value).toBe(4.38);
        expect(MCT88.sources.datasheetOverview.page).toBe(1);
        expect(MCT88.sources.datasheetDimensions.page).toBe(6);
    });

    test("retrieves each crane by its stable id", () => {
        expect(getCraneById("potain-mct-88")).toBe(MCT88);
        expect(getCraneById("potain-mct-85-f5")).toBe(MCT85F5);
        expect(getCraneById("missing-crane")).toBeUndefined();
    });

    test("exposes the MCT 85 F5 with sourced chart values", () => {
        expect(TOWER_CRANES.map((crane) => crane.id)).toEqual(["potain-mct-88", "potain-mct-85-f5"]);

        expect(MCT85F5.id).toBe("potain-mct-85-f5");
        expect(MCT85F5.standard).toBe("FEM 1.001-A3");
        expect(MCT85F5.maxCapacityT.value).toBe(5);
        expect(MCT85F5.maxJibLengthM.value).toBe(52);
        expect(MCT85F5.defaultJibM.value).toBe(30);
        expect(MCT85F5.defaultJibM.provenance.kind).toBe("indicative");
        expect(MCT85F5.loadChart).toHaveLength(8);
        expect(MCT85F5.loadChart?.reduce((total, row) => total + row.points.length, 0)).toBe(86);
        expect(MCT85F5.sources.datasheetOverview.page).toBe(1);
        expect(MCT85F5.sources.datasheetLoadCharts.page).toBe(3);
        expect(MCT85F5.sources.datasheetDimensions.page).toBe(5);
        expect(MCT85F5.dimensions.counterJibLengthM.value).toBe(14.6);
        expect(MCT85F5.heaviestErectionComponent.massT.value).toBe(4.38);
    });
});

describe("craneDialogNotes", () => {
    test("describes the MCT 88 tip-load model and its project default", () => {
        const notes = craneDialogNotes(MCT88);

        expect(notes.sourceDocument).toContain("Potain MCT 88 Data Sheet");
        expect(notes.sourcePage).toBe(1);
        expect(notes.defaultJibKind).toBe("indicative");
        expect(notes.defaultJibDetail).toContain("30 m");
        expect(notes.capacityMethod).toBe("tip-load");
        expect(notes.capacitySourceDocument).toContain("Potain MCT 88 Data Sheet");
        expect(notes.capacitySourcePage).toBe(1);
    });

    test("describes the MCT 85 F5 chart model and its project default", () => {
        const notes = craneDialogNotes(MCT85F5);

        expect(notes.sourceDocument).toContain("Potain MCT 85 F5 Data Sheet");
        expect(notes.sourcePage).toBe(1);
        expect(notes.defaultJibKind).toBe("indicative");
        expect(notes.defaultJibDetail).toContain("30 m");
        expect(notes.capacityMethod).toBe("chart");
        // The overview and the capacity chart come from different pages.
        expect(notes.capacitySourceDocument).toContain("Potain MCT 85 F5 Data Sheet");
        expect(notes.capacitySourcePage).toBe(3);
    });

    test("reports a sourced default jib with its document and page", () => {
        const sourcedDefault = {
            ...MCT85F5,
            defaultJibM: {
                value: 30,
                provenance: { kind: "source" as const, sourceId: "datasheetOverview" },
            },
        };

        const notes = craneDialogNotes(sourcedDefault);

        expect(notes.defaultJibKind).toBe("source");
        expect(notes.defaultJibDetail).toContain("Potain MCT 85 F5 Data Sheet");
        expect(notes.defaultJibDetail).toContain("p. 1");
    });

    test("renders a sourced default-jib note without an unresolved page placeholder", () => {
        const restore = installEnglishLocale();
        try {
            const text = I18n.translate(
                "tower.dialog.sourceJib" as I18nKeys,
                "Potain MCT 85 F5 Data Sheet, p. 1",
            );

            expect(text).toBe("Default jib provenance - SOURCE: Potain MCT 85 F5 Data Sheet, p. 1.");
            expect(text).not.toContain("{1}");
        } finally {
            restore();
        }
    });
});

describe("validation evidence", () => {
    test("ships a clearly labelled reconstructed calculation with both cranes separated", () => {
        const document = readFileSync(path.resolve(testDir, "../docs/validation-calculation.txt"), "utf8");

        expect(document).toContain("RECONSTRUCTED EVIDENCE");
        expect(document).toContain("NOT THE ORIGINAL");
        expect(document).toContain("MCT 88");
        expect(document).toContain("MCT 85 F5");
        expect(document).toContain("2.70 t");
        expect(document).toContain("2.54 t");
        expect(document).toContain("2.7 m");
        expect(document).toContain("0.907185 t");
    });
});

describe("TowerPickCheckCommand", () => {
    test("shows the sample pick table with PASS/PASS/FAIL and the disclaimer", async () => {
        let dialogTitle: I18nKeys | undefined;
        let dialogContent: HTMLElement | undefined;

        const onDialog = (title: I18nKeys, content: HTMLElement) => {
            dialogTitle = title;
            dialogContent = content;
        };

        PubSub.default.sub("showDialog", onDialog);
        try {
            await new TowerPickCheckCommand().execute({} as IApplication);
        } finally {
            PubSub.default.removeAll("showDialog");
        }

        expect(dialogTitle).toBe("tower.dialog.title" as I18nKeys);
        if (dialogContent === undefined) throw new Error("Command did not publish dialog content.");

        expect(dialogContent.textContent).toContain(PLANNING_DISCLAIMER);

        const statuses = Array.from(dialogContent.querySelectorAll("[data-status]")).map((element) =>
            element.getAttribute("data-status"),
        );
        expect(statuses).toEqual(["PASS", "PASS", "FAIL"]);

        const summary = dialogContent.querySelector("[data-all-pass]");
        expect(summary).not.toBeNull();
        if (summary === null) throw new Error("Dialog summary is missing.");
        expect(summary.getAttribute("data-all-pass")).toBe("false");
    });

    test("renders the overview source and the separate chart source for the MCT 85 F5", async () => {
        const restore = installEnglishLocale();
        let dialogContent: HTMLElement | undefined;

        const onDialog = (_title: I18nKeys, content: HTMLElement) => {
            dialogContent = content;
        };

        try {
            PubSub.default.sub("showDialog", onDialog);
            try {
                await new TowerPickCheckCommand().execute({} as IApplication);
            } finally {
                PubSub.default.removeAll("showDialog");
            }

            if (dialogContent === undefined) throw new Error("Command did not publish dialog content.");

            const craneSelect = dialogContent.querySelector("select");
            expect(craneSelect).not.toBeNull();
            if (craneSelect === null) throw new Error("Crane selector is missing.");

            craneSelect.value = "potain-mct-85-f5";
            craneSelect.dispatchEvent(new Event("change"));

            const text = dialogContent.textContent ?? "";
            expect(text).toContain("Selected crane source: Potain MCT 85 F5 Data Sheet");
            expect(text).toContain("Capacity source: Potain MCT 85 F5 Data Sheet");
            expect(text).toContain("p. 3");
            expect(text).not.toContain("{0}");
            expect(text).not.toContain("{1}");
        } finally {
            restore();
        }
    });

    test("recalculates the sample picks with the MCT 85 F5 chart", async () => {
        let dialogContent: HTMLElement | undefined;

        const onDialog = (_title: I18nKeys, content: HTMLElement) => {
            dialogContent = content;
        };

        PubSub.default.sub("showDialog", onDialog);
        try {
            await new TowerPickCheckCommand().execute({} as IApplication);
        } finally {
            PubSub.default.removeAll("showDialog");
        }

        if (dialogContent === undefined) throw new Error("Command did not publish dialog content.");

        const craneSelect = dialogContent.querySelector("select");
        expect(craneSelect).not.toBeNull();
        if (craneSelect === null) throw new Error("Crane selector is missing.");

        craneSelect.value = "potain-mct-85-f5";
        craneSelect.dispatchEvent(new Event("change"));

        // 30 m chart: 3.9 t at 20 m, 3.0 t at 25 m, 2.5 t at 30 m.
        const statuses = Array.from(dialogContent.querySelectorAll("[data-status]")).map((element) =>
            element.getAttribute("data-status"),
        );
        expect(statuses).toEqual(["PASS", "PASS", "FAIL"]);

        const capacities = Array.from(dialogContent.querySelectorAll("tbody tr")).map(
            (row) => row.querySelectorAll("td")[3].textContent,
        );
        expect(capacities).toEqual(["3.90 t", "3.00 t", "2.50 t"]);

        const jibInput = dialogContent.querySelector('input[type="number"]');
        expect(jibInput).not.toBeNull();
        if (jibInput === null) throw new Error("Jib input is missing.");
        expect(jibInput.value).toBe("30");

        // 52 m: 3.2 t at 20 m, 2.5 t at 25 m, 2.15 t at 30 m.
        jibInput.value = "52";
        jibInput.dispatchEvent(new Event("input"));

        const recalculated = Array.from(dialogContent.querySelectorAll("[data-status]")).map((element) =>
            element.getAttribute("data-status"),
        );
        expect(recalculated).toEqual(["PASS", "FAIL", "FAIL"]);

        const firstRow = dialogContent.querySelectorAll("tbody tr")[0];
        expect(firstRow).not.toBeUndefined();
        const capacityCell = firstRow.querySelectorAll("td")[3];
        expect(capacityCell.textContent).toBe("3.20 t");
    });
});
