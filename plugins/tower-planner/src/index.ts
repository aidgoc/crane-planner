// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CommandKeys, Locale, Plugin } from "@chili3d/core";
import { PlaceTowerCraneCommand } from "./commands/placeCrane";

const TowerPlannerPlugin: Plugin = {
    commands: [PlaceTowerCraneCommand],
    ribbons: [
        {
            tabName: "ribbon.tab.manager",
            groups: [
                {
                    groupName: "ribbon.group.other",
                    items: ["towerplanner.place" as CommandKeys],
                },
            ],
        },
    ],
    guide: [
        {
            name: "Tower Planner",
            content:
                "Place a tower crane in plan, set INDICATIVE min/max hook radius and counter-jib radius, rotate the jib, and drag the mast. The 20 m base exclusion radius is fixed. Rings and results update without a Calculate step. Planning aid, not a certified lift plan.",
        },
    ],
    i18nResources: [
        {
            language: "en",
            display: "English",
            translation: {
                "towerplanner.place": "Place Tower Crane",
                "towerplanner.place.help":
                    "Place and move a tower crane, set INDICATIVE catalogue radii, rotate the jib and inspect the plan rings. Planning aid, not a certified lift plan.",
                "towerplanner.panel.title": "Tower Crane Placement",
            },
        } as unknown as Locale,
    ],
};

export default TowerPlannerPlugin;
