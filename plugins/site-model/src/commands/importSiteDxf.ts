// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type CommandKeys,
    command,
    type I18nKeys,
    type IApplication,
    type ICommand,
    PubSub,
    readFileAsync,
} from "@chili3d/core";
import { writeSiteSource } from "../siteSelection";
import { loadSiteProjectFromDxf } from "../siteSource";

/**
 * Selects the shared site model for the active project (document): the user picks a
 * .dxf site plan, it is parsed and validated through the site-model schema, and only
 * a successfully parsed site is stored. A failed import keeps the previously selected
 * valid site untouched.
 */
@command({
    key: "sitemodel.import" as CommandKeys,
    icon: {
        type: "path",
        value: "icons/site-model.svg",
    },
    helpText: "sitemodel.import.help" as I18nKeys,
})
export class ImportSiteDxfCommand implements ICommand {
    async execute(application: IApplication): Promise<void> {
        const document = application.activeView?.document;
        if (!document) {
            PubSub.default.pub("showToast", "toast.document.noActivated");
            return;
        }

        const files = await readFileAsync(".dxf", false);
        if (!files.isOk) {
            // The picker was cancelled or failed to open; nothing to report.
            return;
        }

        const file = files.value[0];
        const project = loadSiteProjectFromDxf(file.data);
        if (!project.isOk) {
            // Never overwrite an existing valid site with data that failed to parse.
            PubSub.default.pub(
                "showToast",
                "sitemodel.import.failed" as I18nKeys,
                file.fileName,
                project.error,
            );
            return;
        }

        const stored = writeSiteSource(document, {
            kind: "dxfText",
            name: file.fileName,
            dxfText: file.data,
        });
        if (!stored.isOk) {
            PubSub.default.pub(
                "showToast",
                "sitemodel.import.failed" as I18nKeys,
                file.fileName,
                stored.error,
            );
            return;
        }

        PubSub.default.pub("showToast", "sitemodel.import.success" as I18nKeys, file.fileName, document.name);
    }
}
