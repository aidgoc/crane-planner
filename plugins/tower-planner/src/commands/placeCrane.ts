// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type CommandKeys,
    command,
    type I18nKeys,
    type IApplication,
    type ICommand,
    type IDocument,
    PubSub,
} from "@chili3d/core";
import { hasSiteSource, readSiteSource } from "../../../site-model/src/siteSelection";
import { loadSiteProjectFromDxf } from "../../../site-model/src/siteSource";
import type { OversailSite } from "../model/oversailTypes";
import { adaptSiteSnapshot } from "../model/siteSnapshot";
import { TowerCranePlacementPanel } from "../ui/placementPanel";

let activePanel: TowerCranePlacementPanel | undefined;

/**
 * Resolve the site the active project has selected through the site-model plugin.
 * There is no implicit fallback: a project without a selected site — or one whose
 * stored DXF no longer parses — opens the panel without site data, and T8/T9 then
 * report UNAVAILABLE rather than a fabricated PASS.
 */
function loadPlacementSite(document: IDocument): OversailSite | undefined {
    if (!hasSiteSource(document)) {
        PubSub.default.pub("showToast", "towerplanner.site.noActiveSite" as I18nKeys, document.name);
        return undefined;
    }

    const source = readSiteSource(document);
    if (!source.isOk) {
        PubSub.default.pub("showToast", "towerplanner.site.unavailable" as I18nKeys, source.error);
        return undefined;
    }

    const project = loadSiteProjectFromDxf(source.value.dxfText);
    if (!project.isOk) {
        PubSub.default.pub("showToast", "towerplanner.site.unavailable" as I18nKeys, project.error);
        return undefined;
    }

    const site = adaptSiteSnapshot(project.value);
    if (!site.isOk) {
        PubSub.default.pub("showToast", "towerplanner.site.unavailable" as I18nKeys, site.error);
        return undefined;
    }

    return site.value;
}

/**
 * The placement is a temporary plan overlay, not a document node. It is not
 * written to the document, is not serialized, and is removed by
 * TowerCranePlacementPanel.dispose() when the panel, view or document closes.
 */
@command({
    key: "towerplanner.place" as CommandKeys,
    icon: "icon-cog",
    helpText: "towerplanner.place.help" as I18nKeys,
})
export class PlaceTowerCraneCommand implements ICommand {
    async execute(application: IApplication): Promise<void> {
        const view = application.activeView;
        if (!view) {
            PubSub.default.pub("showToast", "toast.document.noActivated");
            return;
        }

        const site = loadPlacementSite(view.document);

        activePanel?.dispose();
        const panel = new TowerCranePlacementPanel(view, site);
        activePanel = panel;
        panel.onDispose(() => {
            if (activePanel === panel) activePanel = undefined;
        });
        panel.show();
    }
}
