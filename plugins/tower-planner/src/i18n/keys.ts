// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export const TOWER_I18N_KEYS = [
    "command.tower.pick",
    "tower.description",
    "towerplanner.place",
    "towerplanner.place.help",
    "towerplanner.panel.title",
    "tower.dialog.title",
    "tower.dialog.intro",
    "tower.dialog.crane",
    "tower.dialog.jib",
    "tower.dialog.wind",
    "tower.dialog.windHint",
    "tower.dialog.pick",
    "tower.dialog.load",
    "tower.dialog.radius",
    "tower.dialog.capacity",
    "tower.dialog.utilisation",
    "tower.dialog.status",
    "tower.dialog.summary",
    "tower.dialog.sourceLine",
    "tower.dialog.indicativeJib",
    "tower.dialog.sourceJib",
    "tower.dialog.capacityMethodChart",
    "tower.dialog.capacityMethodTipLoad",
    "tower.dialog.capacitySourceLine",
    "tower.dialog.windRule",
    "tower.dialog.invalidHint",
    "tower.dialog.close",
    "tower.status.pass",
    "tower.status.fail",
    "tower.status.outOfRange",
    "tower.status.invalid",
] as const;

export type TowerI18nKey = (typeof TOWER_I18N_KEYS)[number];
