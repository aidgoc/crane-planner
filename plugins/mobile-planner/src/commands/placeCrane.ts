// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// M8 — "Place Mobile Crane" command (ribbon registration)
// Owner: Ajit
// ============================================================================

import {
    type CommandKeys,
    command,
    type I18nKeys,
    type IApplication,
    type ICommand,
    PubSub,
} from "@chili3d/core";
import { loadPlacementObstacles } from "../modules/siteObstacleAdapter";
import { MobileCranePlacementPanel } from "../ui/mobilePlacementPanel";

let activePanel: MobileCranePlacementPanel | undefined;

@command({
    key: "mobile.crane.place" as CommandKeys,
    icon: "icon-cog",
    helpText: "mobile.crane.place.help" as I18nKeys,
})
export class PlaceMobileCraneCommand implements ICommand {
    async execute(application: IApplication): Promise<void> {
        const view = application.activeView;
        if (!view) {
            PubSub.default.pub("showToast", "toast.document.noActivated");
            return;
        }

        const site = loadPlacementObstacles(view.document);

        activePanel?.dispose();
        const panel = new MobileCranePlacementPanel(view, site?.obstacles, site?.siteName);
        activePanel = panel;
        panel.onDispose(() => {
            if (activePanel === panel) activePanel = undefined;
        });
        panel.show();
    }
}
