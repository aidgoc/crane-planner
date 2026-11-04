// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// S1/S3 — "Load Sample Site" Command
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
import { BuildingBodyNode } from "../body/buildingBody";
import { SAMPLE_SITE_PROJECT } from "../sampleSiteData";
import { loadProjectJson } from "../schema";
import { setActiveSiteProject } from "../siteStore";
import type { SiteProject } from "../types";

@command({
    key: "sitemodel.loadSample" as CommandKeys,
    icon: "icon-folder-open",
    helpText: "site.model.loadSample.help" as I18nKeys,
})
export class LoadSampleSiteCommand implements ICommand {
    async execute(application: IApplication): Promise<void> {
        let doc = application.activeView?.document;
        if (!doc) {
            try {
                doc = await application.newDocument("Sample Site");
            } catch {
                PubSub.default.pub("showToast", "toast.document.noActivated");
                return;
            }
        }

        // 1. Fetch live sample-site.json if served over HTTP, with offline bundled fallback
        let siteProject: SiteProject = SAMPLE_SITE_PROJECT;
        try {
            const res = await fetch("/sample-site/sample-site.json");
            if (res.ok) {
                const text = await res.text();
                const parseRes = loadProjectJson(text);
                if (parseRes.isOk) {
                    siteProject = parseRes.value;
                }
            }
        } catch {
            // Offline / preview mode fallback to bundled sample site
            siteProject = SAMPLE_SITE_PROJECT;
        }

        // 2. Set active site project in shared store
        setActiveSiteProject(siteProject);

        // 3. Create and add 3D building solids to Document's ModelManager
        const nodesToAdd: BuildingBodyNode[] = [];
        for (const [key, building] of Object.entries(siteProject.buildings)) {
            if (building.height_m > 0 && building.polygon.length >= 3) {
                const node = new BuildingBodyNode({
                    document: doc,
                    name: key,
                    label: building.label,
                    polygon: building.polygon,
                    heightM: building.height_m,
                });
                nodesToAdd.push(node);
            }
        }

        if (nodesToAdd.length > 0) {
            doc.modelManager.addNode(...nodesToAdd);
        }

        // 4. Notify user with planning disclaimer
        PubSub.default.pub("showToast", "site.model.sampleLoaded" as I18nKeys);
    }
}
