// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Locale } from "@chili3d/core";
import type { TowerI18nKey } from "./keys";

export const en = {
    language: "en",
    display: "English",
    translation: {
        "command.tower.pick": "Tower Pick Check",
        "tower.description": "Check tower-crane picks against the sourced catalogue.",
        "towerplanner.place": "Place Tower Crane",
        "towerplanner.place.help":
            "Place and move a tower crane, set INDICATIVE catalogue radii, rotate the jib and inspect the plan rings. Planning aid, not a certified lift plan.",
        "towerplanner.panel.title": "Tower Crane Placement",
        "tower.dialog.title": "Tower crane pick check",
        "tower.dialog.intro":
            "Sample picks on the selected crane. Edit load, radius, jib or wind to re-check.",
        "tower.dialog.crane": "Crane",
        "tower.dialog.jib": "Jib length (m)",
        "tower.dialog.wind": "Wind (km/h, optional)",
        "tower.dialog.windHint": "Blank means no wind derate.",
        "tower.dialog.pick": "Pick",
        "tower.dialog.load": "Load (t)",
        "tower.dialog.radius": "Radius (m)",
        "tower.dialog.capacity": "Capacity (t)",
        "tower.dialog.utilisation": "Utilisation",
        "tower.dialog.status": "Status",
        "tower.dialog.summary": "{0} of {1} picks pass.",
        "tower.dialog.sourceLine": "Selected crane source: {0}, p. {1}.",
        "tower.dialog.indicativeJib": "Default jib provenance - INDICATIVE: {0}",
        "tower.dialog.sourceJib": "Default jib provenance - SOURCE: {0}.",
        "tower.dialog.capacityMethodChart":
            "Capacity method: published per-radius load chart; between chart points the next larger radius is used, and no extrapolation is allowed.",
        "tower.dialog.capacityMethodTipLoad":
            "Capacity method: idealised tip-load model (tip load x jib / radius). Application calculation, not a manufacturer chart.",
        "tower.dialog.capacitySourceLine": "Capacity source: {0}, p. {1}.",
        "tower.dialog.windRule":
            "Wind derate: SIMULATED product rule (x{0} at {1} km/h or above); not a verified manufacturer rule.",
        "tower.dialog.invalidHint":
            "Load and radius must be positive; wind must be zero or a positive number; the jib must be supported by the selected crane's published data.",
        "tower.dialog.close": "Close",
        "tower.status.pass": "PASS",
        "tower.status.fail": "FAIL",
        "tower.status.outOfRange": "OUT OF RANGE",
        "tower.status.invalid": "INVALID",
    } satisfies Record<TowerI18nKey, string>,
} as unknown as Locale;
