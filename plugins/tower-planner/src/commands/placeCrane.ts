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
import { TowerCranePlacementPanel } from "../ui/placementPanel";

let activePanel: TowerCranePlacementPanel | undefined;

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

        activePanel?.dispose();
        const panel = new TowerCranePlacementPanel(view);
        activePanel = panel;
        panel.onDispose(() => {
            if (activePanel === panel) activePanel = undefined;
        });
        panel.show();
    }
}
