// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type CommandKeys,
    command,
    type DialogButton,
    type I18nKeys,
    type IApplication,
    type ICommand,
    PubSub,
} from "@chili3d/core";
import { div, input, label, p } from "@chili3d/element";
import { openReportPrintWindow, type ReportData } from "../../../site-model/src/report";
import { PLANNING_DISCLAIMER } from "../disclaimer";
import type { TowerI18nKey } from "../i18n/keys";
import { t } from "../i18n/translate";
import {
    buildTowerPickReport,
    type TowerPickReportMetadata,
    type TowerPickReportMetadataIssue,
    validateTowerPickReportMetadata,
} from "../report/towerPickReport";
import { type PickCheckSession, readPickCheckSession } from "../report/towerPickSession";

const METADATA_ISSUE_I18N: Record<TowerPickReportMetadataIssue, TowerI18nKey> = {
    project: "tower.report.invalidProject",
    author: "tower.report.invalidAuthor",
    date: "tower.report.invalidDate",
};

function errorMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

function metadataField(text: string, control: HTMLElement): HTMLLabelElement {
    const field = label(text);
    field.style.display = "grid";
    field.style.gap = "4px";
    field.append(control);
    return field;
}

@command({
    key: "tower.report" as CommandKeys,
    icon: "icon-export",
    helpText: "tower.report.help",
})
export class TowerPickReportCommand implements ICommand {
    execute(application: IApplication): Promise<void> {
        const document = application.activeView?.document;
        if (document === undefined) {
            PubSub.default.pub("showToast", "tower.report.noDocument" as I18nKeys);
            return Promise.resolve();
        }

        const session = readPickCheckSession(document);
        if (session === undefined) {
            PubSub.default.pub("showToast", "tower.report.noSession" as I18nKeys);
            return Promise.resolve();
        }

        this.showMetadataDialog(document.name, session);
        return Promise.resolve();
    }

    /**
     * A small test seam for the defensive path where the report data cannot be
     * built. The command must keep the dialog open and must not open a window.
     */
    protected buildReport(session: PickCheckSession, metadata: TowerPickReportMetadata): ReportData {
        return buildTowerPickReport(session, metadata);
    }

    private showMetadataDialog(documentName: string, session: PickCheckSession): void {
        const content = div();
        content.style.display = "grid";
        content.style.gap = "10px";
        content.style.minWidth = "420px";

        const disclaimer = p(PLANNING_DISCLAIMER);
        disclaimer.style.fontWeight = "700";
        disclaimer.style.margin = "0";

        const intro = p(t("tower.report.intro"));
        intro.style.margin = "0";

        const wind = session.windKmh === null ? t("tower.report.windNone") : `${session.windKmh} km/h`;
        const summary = p(
            t(
                "tower.report.sessionSummary",
                session.crane.name,
                session.jibM.value,
                session.picks.length,
                wind,
            ),
        );
        summary.style.margin = "0";
        summary.style.fontSize = "12px";
        summary.style.fontWeight = "600";

        const projectInput = input({ type: "text", value: documentName.trim() });
        projectInput.setAttribute("data-role", "report-project");

        const authorInput = input({ type: "text" });
        authorInput.setAttribute("data-role", "report-author");

        const dateInput = input({ type: "date" });
        dateInput.setAttribute("data-role", "report-date");

        const siteInput = input({ type: "text" });
        siteInput.setAttribute("data-role", "report-site");
        siteInput.placeholder = t("tower.report.siteHint");

        const error = p();
        error.setAttribute("data-role", "report-metadata-error");
        error.setAttribute("data-state", "ok");
        error.style.margin = "0";
        error.style.fontSize = "12px";
        error.style.fontWeight = "600";
        error.style.color = "#b42318";

        function setError(message: string | undefined): void {
            error.textContent = message ?? "";
            error.setAttribute("data-state", message === undefined ? "ok" : "invalid");
        }

        function readMetadata(): TowerPickReportMetadata {
            return {
                projectName: projectInput.value,
                author: authorInput.value,
                date: dateInput.value,
                siteLocation: siteInput.value,
            };
        }

        let preparedData: ReportData | undefined;

        const confirmButton: DialogButton = {
            content: "common.confirm",
            shouldClose: () => {
                preparedData = undefined;
                const metadata = readMetadata();
                const issue = validateTowerPickReportMetadata(metadata);
                if (issue !== undefined) {
                    setError(t(METADATA_ISSUE_I18N[issue]));
                    return false;
                }

                try {
                    preparedData = this.buildReport(session, metadata);
                } catch (cause) {
                    setError(t("tower.report.invalidData", errorMessage(cause)));
                    return false;
                }

                setError(undefined);
                return true;
            },
            onclick: () => {
                if (preparedData === undefined) return;

                try {
                    if (openReportPrintWindow(preparedData) === null) {
                        PubSub.default.pub("showToast", "tower.report.blocked" as I18nKeys);
                    }
                } catch (cause) {
                    PubSub.default.pub("showToast", "tower.report.failed" as I18nKeys, errorMessage(cause));
                }
            },
        };

        content.append(
            disclaimer,
            intro,
            summary,
            metadataField(t("tower.report.project"), projectInput),
            metadataField(t("tower.report.author"), authorInput),
            metadataField(t("tower.report.date"), dateInput),
            metadataField(t("tower.report.site"), siteInput),
            error,
        );

        PubSub.default.pub("showDialog", "tower.report.title" as I18nKeys, content, [
            confirmButton,
            { content: "common.cancel" },
        ]);
    }
}
