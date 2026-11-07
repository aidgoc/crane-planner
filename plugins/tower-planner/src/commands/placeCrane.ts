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
import { loadSiteProjectFromUrl } from "../../../site-model/src/siteSource";
import type { OversailSite } from "../model/oversailTypes";
import { adaptSiteSnapshot } from "../model/siteSnapshot";
import { TowerCranePlacementPanel } from "../ui/placementPanel";

let activePanel: TowerCranePlacementPanel | undefined;

async function loadPlacementSite(): Promise<OversailSite | undefined> {
    const project = await loadSiteProjectFromUrl();
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

        const site = await loadPlacementSite();

        activePanel?.dispose();
        const panel = new TowerCranePlacementPanel(view, site);
        activePanel = panel;
        panel.onDispose(() => {
            if (activePanel === panel) activePanel = undefined;
        });
        panel.show();
    }
}
