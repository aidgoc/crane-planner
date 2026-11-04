// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CommandKeys, Locale, Plugin, RibbonGroupKeys, RibbonTabKeys } from "@chili3d/core";
import { LoadSampleSiteCommand } from "./commands/loadSampleSite";
import { REQUIRED_DISCLAIMER } from "./types";

export * from "./body/buildingBody";
export * from "./commands/loadSampleSite";
export * from "./dxfParser";
export * from "./extrusion";
export * from "./hazardClearance";
export * from "./imageUnderlay";
export * from "./polygonEditor";
export * from "./sampleSiteData";
export * from "./schema";
export * from "./siteStore";
export * from "./types";

const SiteModelPlugin: Plugin = {
    commands: [LoadSampleSiteCommand],
    ribbons: [
        {
            tabName: "ribbon.tab.manager" as RibbonTabKeys,
            groups: [
                {
                    groupName: "ribbon.group.other" as RibbonGroupKeys,
                    items: ["sitemodel.loadSample" as CommandKeys],
                },
            ],
        },
    ],
    guide: [
        {
            name: "DGOC Site Model",
            content: `Shared site model plugin for DGOC Crane Planner. Parses DXF site plans, extrudes 3D buildings, calibrates image underlays, edits site polygons, and manages hazards. Use the "Load Sample Site" button in the Manager tab to load synthetic buildings and hazards into the CAD scene. ${REQUIRED_DISCLAIMER}`,
        },
    ],
    i18nResources: [
        {
            language: "en",
            display: "English",
            translation: {
                "command.sitemodel.loadSample": "Load Sample Site",
                "site.model.name": "Site Model",
                "site.model.loadSample.help":
                    "Load DGOC synthetic sample site (Tower A, Tower B, Podium, Neighbours, Power Line). Planning aid, not a certified lift plan.",
                "site.model.sampleLoaded":
                    "Sample site loaded successfully. Planning aid, not a certified lift plan.",
                "site.model.disclaimer": REQUIRED_DISCLAIMER,
                "site.model.underlay": "Image Underlay",
                "site.model.drawPolygon": "Draw Polygon",
                "site.model.building": "Site Building",
                "site.model.buildingLabel": "Building Label",
                "site.model.height": "Height (m)",
            },
        } as unknown as Locale,
    ],
};

export default SiteModelPlugin;
