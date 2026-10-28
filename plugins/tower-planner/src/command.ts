// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type CommandKeys,
    command,
    type I18nKeys,
    type IApplication,
    type ICommand,
    PubSub,
} from "@chili3d/core";
import { div, input, label, p, select } from "@chili3d/element";
import { WIND_DERATE_RULE } from "./capacity";
import { getCraneById, MCT88, TOWER_CRANES } from "./catalogue";
import { PLANNING_DISCLAIMER } from "./disclaimer";
import type { TowerI18nKey } from "./i18n/keys";
import { t } from "./i18n/translate";
import { evaluateCrane, type Pick, type PickStatus } from "./pickEngine";
import type { SourceDocument, TowerCrane } from "./types";

const OVERVIEW_SOURCE_ID = "datasheetOverview";

/**
 * Resolve the document that supplies the capacity data. Chart cranes point at
 * the chart row's own provenance, which can be a different page (MCT 85 F5:
 * overview p. 1, load curves p. 3) from the overview source. Tip-load cranes
 * fall back to the overview document.
 */
function capacitySource(crane: TowerCrane): SourceDocument {
    const firstChart = crane.loadChart?.[0];
    const provenance = firstChart?.jibM.provenance ?? firstChart?.points[0]?.radiusM.provenance;
    if (provenance?.kind === "source") {
        const source = crane.sources[provenance.sourceId];
        if (source !== undefined) return source;
    }
    return crane.sources[OVERVIEW_SOURCE_ID];
}

/**
 * The crane-specific content behind the dialog's source, default-jib and
 * capacity-method notes. Extracted from the DOM code so the selection can be
 * tested without registering the plugin locale.
 */
export type CraneDialogNotes = {
    sourceDocument: string;
    sourcePage: number;
    defaultJibKind: "source" | "indicative";
    defaultJibDetail: string;
    capacityMethod: "chart" | "tip-load";
    capacitySourceDocument: string;
    capacitySourcePage: number;
};

export function craneDialogNotes(crane: TowerCrane): CraneDialogNotes {
    const overview = crane.sources[OVERVIEW_SOURCE_ID];
    const provenance = crane.defaultJibM.provenance;
    const capacity = capacitySource(crane);

    let defaultJibDetail: string;
    if (provenance.kind === "indicative") {
        defaultJibDetail = provenance.basis;
    } else {
        const document = crane.sources[provenance.sourceId];
        defaultJibDetail = `${document.document}, p. ${document.page}`;
    }

    return {
        sourceDocument: overview.document,
        sourcePage: overview.page,
        defaultJibKind: provenance.kind,
        defaultJibDetail,
        capacityMethod: crane.loadChart ? "chart" : "tip-load",
        capacitySourceDocument: capacity.document,
        capacitySourcePage: capacity.page,
    };
}

const STATUS_I18N: Record<PickStatus, TowerI18nKey> = {
    PASS: "tower.status.pass",
    FAIL: "tower.status.fail",
    OUT_OF_RANGE: "tower.status.outOfRange",
    INVALID: "tower.status.invalid",
};

type PickRowControls = {
    load: HTMLInputElement;
    radius: HTMLInputElement;
    capacity: HTMLTableCellElement;
    utilisation: HTMLTableCellElement;
    status: HTMLTableCellElement;
};

function createCell(tag: "td" | "th", text = ""): HTMLTableCellElement {
    const cell = document.createElement(tag);
    cell.textContent = text;
    cell.style.padding = "4px 6px";
    cell.style.borderBottom = "1px solid #d8dde5";
    cell.style.textAlign = "left";
    return cell;
}

function createInput(value: string, step: string, min = "0"): HTMLInputElement {
    const element = input({ type: "number", value, step, min });
    element.style.width = "76px";
    return element;
}

/**
 * Sample picks are worked out by hand in the test comment:
 *   M = 2.70 t × 30 m = 81 t·m; corner radius = 81 / 5 = 16.2 m.
 *   2.5 t @ 20 m -> capacity 4.05 t -> 61.7 %, PASS
 *   3.0 t @ 25 m -> capacity 3.24 t -> 92.6 %, PASS
 *   4.0 t @ 30 m -> capacity 2.70 t -> 148.1 %, FAIL
 */
export const SAMPLE_PICKS: readonly Pick[] = [
    { label: "1", loadT: 2.5, radiusM: 20 },
    { label: "2", loadT: 3.0, radiusM: 25 },
    { label: "3", loadT: 4.0, radiusM: 30 },
];

@command({
    key: "tower.pick" as CommandKeys,
    icon: {
        type: "path",
        value: "icons/tower.svg",
    },
    helpText: "tower.description",
})
export class TowerPickCheckCommand implements ICommand {
    execute(_application: IApplication): Promise<void> {
        const content = div();
        content.style.display = "grid";
        content.style.gap = "10px";
        content.style.minWidth = "680px";

        const disclaimer = p(PLANNING_DISCLAIMER);
        disclaimer.style.fontWeight = "700";
        disclaimer.style.margin = "0";

        const intro = p(t("tower.dialog.intro"));
        intro.style.margin = "0";

        const controls = div();
        controls.style.display = "flex";
        controls.style.flexWrap = "wrap";
        controls.style.gap = "12px";
        controls.style.alignItems = "end";

        const craneSelect = select();
        for (const crane of TOWER_CRANES) {
            const item = document.createElement("option");
            item.value = crane.id;
            item.textContent = crane.name;
            craneSelect.append(item);
        }
        craneSelect.value = MCT88.id;

        const craneField = label(t("tower.dialog.crane"));
        craneField.style.display = "grid";
        craneField.append(craneSelect);

        const jibInput = createInput(String(MCT88.defaultJibM.value), "0.1");
        const jibField = label(t("tower.dialog.jib"));
        jibField.style.display = "grid";
        jibField.append(jibInput);

        const windInput = createInput("", "1");
        windInput.placeholder = t("tower.dialog.windHint");
        const windField = label(t("tower.dialog.wind"));
        windField.style.display = "grid";
        windField.append(windInput);

        controls.append(craneField, jibField, windField);

        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";
        table.style.fontSize = "13px";

        const header = document.createElement("thead");
        const headerRow = document.createElement("tr");
        for (const key of [
            "tower.dialog.pick",
            "tower.dialog.load",
            "tower.dialog.radius",
            "tower.dialog.capacity",
            "tower.dialog.utilisation",
            "tower.dialog.status",
        ] as TowerI18nKey[]) {
            headerRow.append(createCell("th", t(key)));
        }
        header.append(headerRow);

        const body = document.createElement("tbody");
        const rows: PickRowControls[] = [];

        for (const pick of SAMPLE_PICKS) {
            const row = document.createElement("tr");
            const load = createInput(String(pick.loadT), "0.1");
            const radius = createInput(String(pick.radiusM), "0.1");
            const capacity = createCell("td", "-");
            const utilisation = createCell("td", "-");
            const status = createCell("td", "-");

            const labelCell = createCell("td", pick.label ?? "");
            const loadCell = createCell("td");
            const radiusCell = createCell("td");
            loadCell.append(load);
            radiusCell.append(radius);
            row.append(labelCell, loadCell, radiusCell, capacity, utilisation, status);
            body.append(row);
            rows.push({ load, radius, capacity, utilisation, status });
        }

        table.append(header, body);

        const summary = p();
        summary.style.fontWeight = "600";
        summary.style.margin = "0";

        const source = p();
        source.style.margin = "0";
        source.style.fontSize = "12px";

        const jibProvenance = p();
        jibProvenance.style.margin = "0";
        jibProvenance.style.fontSize = "12px";

        const capacityMethod = p();
        capacityMethod.style.margin = "0";
        capacityMethod.style.fontSize = "12px";

        const capacitySourceLine = p();
        capacitySourceLine.style.margin = "0";
        capacitySourceLine.style.fontSize = "12px";

        const windRule = p(
            t("tower.dialog.windRule", WIND_DERATE_RULE.factor, WIND_DERATE_RULE.thresholdKmh),
        );
        windRule.style.margin = "0";
        windRule.style.fontSize = "12px";

        const invalidHint = p(t("tower.dialog.invalidHint"));
        invalidHint.style.margin = "0";
        invalidHint.style.fontSize = "12px";

        function selectedCrane() {
            return getCraneById(craneSelect.value) ?? MCT88;
        }

        /**
         * The source and default-jib notes must describe the selected crane, not
         * the MCT 88 baseline. The default jib is a project choice for both
         * catalogue entries, so its provenance is always shown explicitly.
         */
        function updateCraneNotes(crane: TowerCrane): void {
            const notes = craneDialogNotes(crane);
            source.textContent = t("tower.dialog.sourceLine", notes.sourceDocument, notes.sourcePage);

            jibProvenance.textContent =
                notes.defaultJibKind === "indicative"
                    ? t("tower.dialog.indicativeJib", notes.defaultJibDetail)
                    : t("tower.dialog.sourceJib", notes.defaultJibDetail);

            capacityMethod.textContent = t(
                notes.capacityMethod === "chart"
                    ? "tower.dialog.capacityMethodChart"
                    : "tower.dialog.capacityMethodTipLoad",
            );

            capacitySourceLine.textContent = t(
                "tower.dialog.capacitySourceLine",
                notes.capacitySourceDocument,
                notes.capacitySourcePage,
            );
        }

        function readPicks(): Pick[] {
            return rows.map((row, index) => ({
                label: SAMPLE_PICKS[index].label,
                loadT: Number(row.load.value),
                radiusM: Number(row.radius.value),
            }));
        }

        function recalculate(): void {
            const crane = selectedCrane();
            const jibM = Number(jibInput.value);
            const windText = windInput.value.trim();
            const windKmh = windText === "" ? null : Number(windText);
            const evaluation = evaluateCrane(crane, readPicks(), { jibM, windKmh });

            evaluation.picks.forEach((result, index) => {
                const row = rows[index];
                row.capacity.textContent =
                    result.capacityT === null ? "-" : `${result.capacityT.toFixed(2)} t`;
                row.utilisation.textContent =
                    result.utilisationPct === null ? "-" : `${result.utilisationPct.toFixed(1)} %`;
                row.status.textContent = t(STATUS_I18N[result.status]);
                row.status.setAttribute("data-status", result.status);
                row.status.style.fontWeight = "600";
                row.status.style.color =
                    result.status === "PASS" ? "#1b7f3a" : result.status === "FAIL" ? "#b42318" : "#8a5a00";
            });

            const passing = evaluation.picks.filter((result) => result.status === "PASS").length;
            summary.textContent = t("tower.dialog.summary", passing, evaluation.picks.length);
            summary.setAttribute("data-all-pass", String(evaluation.allPass));
        }

        craneSelect.addEventListener("change", () => {
            const crane = selectedCrane();
            jibInput.value = String(crane.defaultJibM.value);
            updateCraneNotes(crane);
            recalculate();
        });
        for (const row of rows) {
            row.load.addEventListener("input", recalculate);
            row.radius.addEventListener("input", recalculate);
        }
        jibInput.addEventListener("input", recalculate);
        windInput.addEventListener("input", recalculate);

        updateCraneNotes(selectedCrane());
        recalculate();

        content.append(
            disclaimer,
            intro,
            controls,
            table,
            summary,
            source,
            jibProvenance,
            capacityMethod,
            capacitySourceLine,
            windRule,
            invalidHint,
        );

        PubSub.default.pub("showDialog", "tower.dialog.title" as I18nKeys, content, [
            { content: "tower.dialog.close" as I18nKeys },
        ]);

        return Promise.resolve();
    }
}
