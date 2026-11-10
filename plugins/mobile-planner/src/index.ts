// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CommandKeys, Locale, Plugin, RibbonGroupKeys, RibbonTabKeys } from "@chili3d/core";
import { PlaceMobileCraneCommand } from "./commands/placeCrane";
import { ShowCraneCommand } from "./commands/showCrane";
import { KIT } from "./modules/craneModel";

export * from "./body/mobileCraneBody";
export * from "./clearance/distance";
export type { ObstacleClearanceResult } from "./clearance/siteClearance";
export * from "./clearance/siteClearance";
export * from "./modules/craneModel";
export * from "./modules/outriggers";
export * from "./modules/placementState";
export * from "./modules/sampleSiteObstacles";
export * from "./ui/liftSummary";
export * from "./ui/mobilePlacementPanel";

const MobilePlannerPlugin: Plugin = {
    commands: [ShowCraneCommand, PlaceMobileCraneCommand],
    ribbons: [
        {
            tabName: "ribbon.tab.plugin" as RibbonTabKeys,
            groups: [
                {
                    groupName: "ribbon.group.plugin" as RibbonGroupKeys,
                    items: ["mobile.crane.show" as CommandKeys],
                },
            ],
        },
        {
            tabName: "ribbon.tab.manager",
            groups: [
                {
                    groupName: "ribbon.group.other",
                    items: ["mobile.crane.place" as CommandKeys],
                },
            ],
        },
    ],
    guide: [
        {
            name: "Mobile Crane Planner",
            content:
                `${KIT.name} load-chart capacity lookup and placement. Source: ${KIT.source.document}, page ${KIT.source.page}; ` +
                `${KIT.source.status}. Move the crane and capacity, pad loads and clearance all update live. Planning aid, not a certified lift plan.`,
        },
    ],
    i18nResources: [
        {
            language: "en",
            display: "English",
            translation: {
                "command.mobile.crane.show": "Mobile Crane",
                "command.mobile.crane.place": "Place Mobile Crane",
                "mobile.crane.show.description": "Show the mobile crane source and planning disclaimer",
                "mobile.crane.place.help":
                    "Place mobile crane on the site. Capacity, outrigger reactions and obstacle clearance update live.",
                "mobile.placement.title": "Mobile Crane Placement",
                "mobile.crane.loaded": `${KIT.name} loaded. Planning aid, not a certified lift plan.`,
                "mobile.crane.marker": "Mobile Crane",
            },
        } as unknown as Locale,
    ],
};

export { calculateLiftCheck } from "./modules/liftCheck";
export * from "./ui/groundBearingPanel";
export { KIT };
export default MobilePlannerPlugin;
