// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CommandKeys, Plugin, RibbonGroupKeys, RibbonTabKeys } from "@chili3d/core";
import { TowerPickCheckCommand } from "./command";
import { PlaceTowerCraneCommand } from "./commands/placeCrane";
import { TowerPickReportCommand } from "./commands/towerPickReport";
import { en } from "./i18n/en";

const TowerPlannerPlugin: Plugin = {
    commands: [TowerPickCheckCommand, TowerPickReportCommand, PlaceTowerCraneCommand],
    ribbons: [
        {
            tabName: "ribbon.tab.plugin" as RibbonTabKeys,
            groups: [
                {
                    groupName: "ribbon.group.plugin" as RibbonGroupKeys,
                    items: ["tower.pick" as CommandKeys, "tower.report" as CommandKeys],
                },
            ],
        },
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
                "The “Tower Pick Check” button in the Plugin tab opens a sample pick list, resolves supply/drop radii from the entered mast position, and compares every catalogue crane in a pick-by-pick selection matrix. It shows per-pick capacity, utilisation and PASS/FAIL using the sourced catalogue, and marks a crane as passing only when every pick passes. " +
                "The “Tower Pick Report” button prints a report from the last captured Pick Check for the active document after the author, date and optional site location are entered. The report copies the captured pick results and does not recalculate them, and it does not invent site, T8 oversail or T9 height results. " +
                "The “Place Tower Crane” button in the Manager tab places and moves a tower crane, sets INDICATIVE min/max hook radius and counter-jib radius, rotates the jib, and drags the mast. The INDICATIVE 20 m base exclusion radius is fixed. Rings and results update without a Calculate step. Planning aid, not a certified lift plan.",
        },
    ],
    i18nResources: [en],
};

export type {
    CraneSimulationState,
    HoistState,
    MotionCommand,
    MotionControllerConfig,
    SimulationState,
    SimulationStatus,
    SlewState,
    TrolleyState,
    UpdateResult,
    VelocityLimits,
} from "./simulation";
export {
    clamp,
    createDefaultCraneSimulationState,
    createHoistState,
    createSlewState,
    createTrolleyState,
    DEFAULT_MOTION_CONTROLLER_CONFIG,
    DEFAULT_VELOCITY_LIMITS,
    MotionController,
    normalizeAngleDeg,
    updateHoist,
    updateSlew,
    updateTrolley,
    validateVelocityLimits,
} from "./simulation";

export default TowerPlannerPlugin;
