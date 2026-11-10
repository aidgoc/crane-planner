// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CommandKeys, Locale, Plugin, RibbonGroupKeys, RibbonTabKeys } from "@chili3d/core";
import { ImportSiteDxfCommand } from "./commands/importSiteDxf";
import { REQUIRED_DISCLAIMER } from "./types";

export * from "./dxfParser";
export * from "./extrusion";
export * from "./schema";
export * from "./siteSelection";
export * from "./siteSource";
export * from "./types";

const SiteModelPlugin: Plugin = {
    commands: [ImportSiteDxfCommand],
    ribbons: [
        {
            tabName: "ribbon.tab.manager" as RibbonTabKeys,
            groups: [
                {
                    groupName: "ribbon.group.other" as RibbonGroupKeys,
                    items: ["sitemodel.import" as CommandKeys],
                },
            ],
        },
    ],
    guide: [
        {
            name: "DGOC Site Model",
            content: `Shared site model plugin for DGOC Crane Planner. Parses DXF site plans, extrudes 3D buildings, and manages hazards. Import Site DXF selects the shared site model for the active project; Tower Crane Planner then plans against that site instead of a fixed sample. ${REQUIRED_DISCLAIMER}`,
        },
    ],
    i18nResources: [
        {
            language: "en",
            display: "English",
            translation: {
                "site.model.name": "Site Model",
                "site.model.disclaimer": REQUIRED_DISCLAIMER,
                "sitemodel.import": "Import Site DXF",
                "sitemodel.import.help":
                    "Pick a .dxf site plan for the active project, parse and validate it through the shared site schema, and select it as the project's site model. Planning aid, not a certified lift plan.",
                "sitemodel.import.success":
                    "Site '{0}' selected for project '{1}'. Tower Crane Planner now uses this site.",
                "sitemodel.import.failed":
                    "Could not import site '{0}': {1}. The previously selected site was kept.",
            },
        } as unknown as Locale,
    ],
};

export default SiteModelPlugin;
