// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// Consumer-shaped tests (Anjali 6). M9 (mobile) and T10 (tower) are not on main yet, so these tests
// build the data the way those two reports will, and call the helper through the plugin's public entry
// (`../src`, which is what a consumer imports). They do not import code from the other plugins.

import * as siteModel from "../src";
import { generateReportHtml, REQUIRED_DISCLAIMER, type ReportData } from "../src";

const meta = { date: "2026-11-07", author: "Test Engineer" };

// M9-shaped: the M8 verdict can be INCOMPLETE when the ground bearing was not checked.
const mobileReport: ReportData = {
    metadata: { ...meta, title: "Mobile lift plan", projectName: "Sample Site", product: "mobile-planner" },
    verdict: {
        status: "INCOMPLETE",
        title: "Lift check",
        summary:
            "Capacity and clearance passed. Ground bearing was not checked (no allowable pressure entered).",
    },
    sections: [
        {
            id: "pads",
            title: "Pad loads",
            columns: [
                { key: "pad", header: "Pad" },
                { key: "load", header: "Load", unit: "t", align: "right" },
            ],
            rows: [
                { cells: { pad: "FL", load: 22.5 }, status: "NOT_CHECKED" },
                { cells: { pad: "RL", load: 7.5 }, status: "NOT_CHECKED" },
            ],
        },
        {
            id: "limits",
            title: "Checks",
            metrics: [
                { label: "Capacity utilisation", value: 22.1, unit: "%", status: "PASS" },
                { label: "Ground bearing", value: undefined, status: "NOT_CHECKED" },
            ],
        },
    ],
    sources: [{ item: "Test fixture capacity", document: "Test fixture", status: "INDICATIVE" }],
    assumptions: [{ category: "geotechnical", description: "Allowable bearing is user-entered." }],
};

// T10-shaped: the pick table has the product statuses of the tower pick engine.
const towerReport: ReportData = {
    metadata: { ...meta, title: "Tower pick plan", projectName: "Sample Site", product: "tower-planner" },
    verdict: { status: "FAIL", title: "Picks", summary: "1 of 5 picks fails; 2 could not be evaluated." },
    sections: [
        {
            id: "picks",
            title: "Pick table",
            columns: [
                { key: "pick", header: "Pick" },
                { key: "radius", header: "Radius", unit: "m", align: "right" },
                { key: "util", header: "Utilisation", unit: "%", align: "right" },
            ],
            rows: [
                { cells: { pick: "P1", radius: 20, util: 61.7 }, status: "PASS" },
                { cells: { pick: "P3", radius: 30, util: 148.1 }, status: "FAIL" },
                { cells: { pick: "P4", radius: 59, util: undefined }, status: "OUT_OF_RANGE" },
                { cells: { pick: "P5", radius: Number.NaN, util: undefined }, status: "INVALID" },
                { cells: { pick: "J1", radius: 20, util: undefined }, status: "UNSUPPORTED" },
            ],
        },
    ],
    sources: [{ item: "Heaviest erection component", document: "Packing list", status: "NOT_STATED" }],
    assumptions: [{ category: "operational", description: "Mast position is entered by the planner." }],
};

describe("S7 shared helper used as M9 and T10 will use it", () => {
    test("the plugin's public entry exports the helper and its constants", () => {
        for (const name of [
            "generateReportHtml",
            "openReportPrintWindow",
            "validateReportData",
            "REQUIRED_DISCLAIMER",
            "METRIC_STATUSES",
            "VERDICT_STATUSES",
            "SOURCE_STATUSES",
            "REPORT_PRODUCTS",
        ]) {
            expect(name in siteModel).toBe(true);
        }
    });

    test("M9-shaped report: product label, INCOMPLETE verdict, NOT_CHECKED rows, disclaimer", () => {
        const html = generateReportHtml(mobileReport);
        expect(html).toContain("Mobile Crane Lift Planner");
        expect(html).not.toContain("Tower Crane Planner");
        expect(html).toContain("Lift check — INCOMPLETE");
        expect(html).toContain('<span class="badge badge-NOT_CHECKED">NOT_CHECKED</span>');
        expect(html).toContain('<span class="metric-value">—</span>');
        expect(html).toContain("22.5");
        expect(html).toContain(`<div class="footer-disclaimer">${REQUIRED_DISCLAIMER}</div>`);
        expect(html).toContain(`⚠️ <strong>SAFETY NOTICE:</strong> ${REQUIRED_DISCLAIMER}`);
    });

    test("T10-shaped report: every pick status is kept and the missing numbers are dashes", () => {
        const html = generateReportHtml(towerReport);
        expect(html).toContain("Tower Crane Planner");
        expect(html).not.toContain("Mobile Crane Lift Planner");
        for (const s of ["PASS", "FAIL", "OUT_OF_RANGE", "INVALID", "UNSUPPORTED"]) {
            expect(html).toContain(`<span class="badge badge-${s}">${s}</span>`);
        }
        expect(html).toContain('<span class="badge badge-NOT_STATED">NOT_STATED</span>');
        expect(html).toContain("148.1");
        expect(html).not.toMatch(/>\s*(NaN|undefined|null|-?Infinity)\s*</);
        expect(html).toContain(`<div class="footer-disclaimer">${REQUIRED_DISCLAIMER}</div>`);
    });
});
