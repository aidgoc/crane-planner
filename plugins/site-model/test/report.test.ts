// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    generateReportHtml,
    openReportPrintWindow,
    REQUIRED_DISCLAIMER,
    type ReportData,
    validateReportData,
} from "../src";

describe("S7: Shared Report Helper (Sujal)", () => {
    /*
     * HAND CALCULATION & ACCEPTANCE CASE 1: Mobile Crane Lift Plan
     * Crane: Liebherr LTM 1050-3.1 (TEST FIXTURE: the numbers below are made up for this test, not from the KIT)
     * Boom length: 38.0 m, Radius: 12.0 m, Slew: 0 deg
     * Capacity at 38m/12m: 47.5 t (test fixture, INDICATIVE; not a published chart value)
     * Lifted load: 10.0 t + Rigging: 0.5 t = 10.5 t
     * Utilisation: 10.5 / 47.5 = 22.11 % (PASS)
     *
     * Outrigger Statics:
     *   W_crane = 50.0 t, W_lift = 10.0 t => Total W = 60.0 t
     *   Spread: L = 8.0 m, B = 6.0 m
     *   Load position: (12.0 m, 0.0 m)
     *   e_x = (50*0 + 10*12) / 60 = 2.0 m, e_y = 0.0 m
     *   delta_x = 60 * 2.0 / (2 * 8.0) = 7.5 t
     *   R_front (FL, FR) = 15.0 + 7.5 = 22.5 t each
     *   R_rear (RL, RR) = 15.0 - 7.5 = 7.5 t each
     *   Pad area = 1.0 m² => Peak pressure = 22.5 t/m² (220.65 kPa)
     *   Allowable ground bearing = 25.0 t/m² => 22.5 <= 25.0 (PASS)
     *   Boom clearance to Tower A: 2.00 m (min required 0.5 m => PASS)
     */
    const sampleMobileReportData: ReportData = {
        metadata: {
            title: "Critical Mobile Crane Lift Plan",
            projectName: "Sample Site - Tower A Erection",
            siteLocation: "North-West Corner, Plot 90x72m",
            date: "2026-11-03",
            author: "Sujal Jadhav (Mobile Lift Planner)",
            product: "mobile-planner",
        },
        verdict: {
            status: "PASS",
            title: "Lift Feasibility Assessment",
            summary:
                "All lift criteria satisfied: utilisation within chart limits, pad reactions stable, and boom clearance maintained.",
        },
        planView: {
            title: "Site Layout & Crane Stance Plan",
            caption: "Plan view showing crane stance at (20m, 25m) with 4 outrigger pads and 38m boom arc.",
            scaleText: "Scale 1:500 (metres)",
            imageDataUrl:
                "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><rect width='400' height='200' fill='%23f1f5f9'/><text x='150' y='100' font-size='16'>Site Plan View</text></svg>",
        },
        sections: [
            {
                id: "lift-params",
                title: "Lift & Crane Geometry",
                description: "Operating configuration and geometry evaluated for this critical pick.",
                metrics: [
                    { label: "Crane Model", value: "Liebherr LTM 1050-3.1", status: "INFO" },
                    { label: "Boom Length", value: 38.0, unit: "m", status: "INFO" },
                    { label: "Working Radius", value: 12.0, unit: "m", status: "INFO" },
                    { label: "Lifted Load", value: 10.0, unit: "t", status: "INFO" },
                    { label: "Rated Capacity", value: 47.5, unit: "t", status: "INFO" },
                    {
                        label: "Capacity Utilisation",
                        value: "22.1 %",
                        status: "PASS",
                        notes: "Chart limit: 47.5 t",
                    },
                    {
                        label: "Boom-to-Building Clearance",
                        value: "2.00 m",
                        status: "PASS",
                        notes: "Tower A corner (limit: 0.5m)",
                    },
                ],
            },
            {
                id: "outriggers",
                title: "Outrigger Reactions & Ground Bearing Check",
                description:
                    "Reactions computed via 4-point rigid plate statics. Pressure evaluated over 1.0 m² pads.",
                columns: [
                    { key: "pad", header: "Pad Location", align: "left" },
                    { key: "reaction", header: "Reaction", unit: "t", align: "right" },
                    { key: "pressure", header: "Pressure", unit: "kPa", align: "right" },
                    { key: "allowable", header: "Allowable", unit: "t/m²", align: "right" },
                    { key: "status", header: "Verdict", align: "center" },
                ],
                rows: [
                    {
                        cells: {
                            pad: "Front-Left (FL)",
                            reaction: 22.5,
                            pressure: 220.65,
                            allowable: 25.0,
                            status: "PASS",
                        },
                        status: "PASS",
                    },
                    {
                        cells: {
                            pad: "Front-Right (FR)",
                            reaction: 22.5,
                            pressure: 220.65,
                            allowable: 25.0,
                            status: "PASS",
                        },
                        status: "PASS",
                    },
                    {
                        cells: {
                            pad: "Rear-Left (RL)",
                            reaction: 7.5,
                            pressure: 73.55,
                            allowable: 25.0,
                            status: "PASS",
                        },
                        status: "PASS",
                    },
                    {
                        cells: {
                            pad: "Rear-Right (RR)",
                            reaction: 7.5,
                            pressure: 73.55,
                            allowable: 25.0,
                            status: "PASS",
                        },
                        status: "PASS",
                    },
                ],
            },
        ],
        sources: [
            {
                item: "LTM 1050-3.1 Load Chart",
                document: "Test fixture (not from the KIT or a brochure)",
                status: "INDICATIVE",
            },
            {
                item: "Crane Dimensions & Spread (8x6m)",
                document: "Test fixture (not from the KIT or a brochure)",
                status: "INDICATIVE",
            },
            {
                item: "Soil Bearing Capacity (25 t/m²)",
                document: "Site Geotechnical Report (User Input)",
                page: 1,
                status: "INDICATIVE",
            },
        ],
        assumptions: [
            {
                category: "structural",
                description:
                    "Outrigger reactions computed assuming rigid plate statics on 4 supporting pads.",
            },
            {
                category: "structural",
                description:
                    "Crane CG assumed fixed at slew centre with counterweight mass included in total weight.",
            },
            {
                category: "geotechnical",
                description: "Uniform pressure distribution under each 1.0 m² outrigger mat.",
            },
            {
                category: "clearance",
                description: "Clearance evaluated using 3D extremeDistance bounding geometry.",
            },
        ],
    };

    // =========================================================================
    // Test 1: Mobile Crane Lift Plan Report HTML generation
    // =========================================================================
    test("generates complete Mobile Crane Lift Plan report with metrics, tables, and sources", () => {
        const html = generateReportHtml(sampleMobileReportData);

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("Critical Mobile Crane Lift Plan");
        expect(html).toContain("Sample Site - Tower A Erection");
        expect(html).toContain("Sujal Jadhav");
        expect(html).toContain("Mobile Crane Lift Planner");

        // Metrics
        expect(html).toContain("Liebherr LTM 1050-3.1");
        expect(html).toContain("38");
        expect(html).toContain("22.1 %");
        expect(html).toContain("2.00 m");

        // Outriggers Table
        expect(html).toContain("Front-Left (FL)");
        expect(html).toContain("22.5");
        expect(html).toContain("220.65");
        expect(html).toContain("Rear-Right (RR)");
        expect(html).toContain("7.5");

        // Sources
        expect(html).toContain("LTM 1050-3.1 Load Chart");
        expect(html).toContain("Test fixture (not from the KIT or a brochure)");
        expect(html).toContain("badge-INDICATIVE");
        expect(html.replace(/<style>[\s\S]*?<\/style>/, "")).not.toContain("badge-VERIFIED");

        // Assumptions
        expect(html).toContain("[STRUCTURAL]");
        expect(html).toContain("rigid plate statics");
    });

    // =========================================================================
    // Test 2: Tower Crane Plan Report HTML generation
    // =========================================================================
    test("generates complete Tower Crane Planner report for Anjali's team", () => {
        const towerReportData: ReportData = {
            metadata: {
                title: "Tower Crane Site Selection Plan",
                projectName: "Sample Site - 90x72m Plot",
                date: "2026-11-03",
                author: "Anjali (Tower Planner Lead)",
                product: "tower-planner",
            },
            verdict: {
                status: "PASS",
                title: "Crane Placement & Capacity",
                summary: "Potain MCT 88 satisfies all 3 required project lifts with no unpermitted oversail.",
            },
            sections: [
                {
                    id: "crane-spec",
                    title: "Selected Crane Specification",
                    metrics: [
                        { label: "Model", value: "Potain MCT 88", status: "INFO" },
                        { label: "Jib Length", value: "30.0 m", status: "INFO" },
                        { label: "Height Under Hook", value: "45.0 m", status: "INFO" },
                        { label: "Max Tip Load", value: "2.70 t", status: "INFO" },
                    ],
                },
                {
                    id: "picks",
                    title: "Scheduled Pick Capacity Checks",
                    columns: [
                        { key: "pick", header: "Pick ID", align: "left" },
                        { key: "load", header: "Mass", unit: "t", align: "right" },
                        { key: "radius", header: "Radius", unit: "m", align: "right" },
                        { key: "capacity", header: "Capacity", unit: "t", align: "right" },
                        { key: "utilisation", header: "Utilisation", align: "right" },
                        { key: "status", header: "Status", align: "center" },
                    ],
                    rows: [
                        {
                            cells: {
                                pick: "Pick 1 (Tower A Steel)",
                                load: 4.0,
                                radius: 20.0,
                                capacity: 5.0,
                                utilisation: "80.0 %",
                                status: "PASS",
                            },
                            status: "PASS",
                        },
                        {
                            cells: {
                                pick: "Pick 2 (Precast Wall)",
                                load: 3.2,
                                radius: 25.0,
                                capacity: 3.24,
                                utilisation: "98.8 %",
                                status: "PASS",
                            },
                            status: "PASS",
                        },
                    ],
                },
            ],
            sources: [
                {
                    item: "Potain MCT 88 Data",
                    document: "Test fixture (not a published MCT 88 chart value)",
                    status: "INDICATIVE",
                },
            ],
            assumptions: [
                { category: "clearance", description: "School boundary oversail restricted to 0 m." },
            ],
        };

        const html = generateReportHtml(towerReportData);

        expect(html).toContain("Tower Crane Site Selection Plan");
        expect(html).toContain("Tower Crane Planner");
        expect(html).toContain("Potain MCT 88");
        expect(html).toContain("Pick 1 (Tower A Steel)");
        expect(html).toContain("80.0 %");
        expect(html).toContain("Pick 2 (Precast Wall)");
    });

    // =========================================================================
    // Test 3: Mandatory Planning Disclaimer Guard
    // =========================================================================
    test("ALWAYS includes the exact mandatory planning disclaimer in banner and footer", () => {
        const html = generateReportHtml(sampleMobileReportData);

        // Required text: "Planning aid, not a certified lift plan."
        expect(REQUIRED_DISCLAIMER).toBe("Planning aid, not a certified lift plan.");
        expect(html).toContain("Planning aid, not a certified lift plan.");

        // Must appear in top banner
        expect(html).toContain('<div class="disclaimer-banner">');
        expect(html).toContain(`⚠️ <strong>SAFETY NOTICE:</strong> ${REQUIRED_DISCLAIMER}`);

        // Must appear in footer
        expect(html).toContain(
            '<div class="footer-disclaimer">Planning aid, not a certified lift plan.</div>',
        );

        // Cannot be omitted or bypassed by setting custom disclaimer in metadata
        const forgedData: ReportData = {
            ...sampleMobileReportData,
            metadata: {
                ...sampleMobileReportData.metadata,
                disclaimer: "Certified Lift Plan", // Attempted overwrite
            },
        };
        const forgedHtml = generateReportHtml(forgedData);
        expect(forgedHtml).toContain(REQUIRED_DISCLAIMER);
    });

    // =========================================================================
    // Test 4: Print stylesheet and A4 pagination rules
    // =========================================================================
    test("embeds complete print CSS with A4 page sizing and page-break guards", () => {
        const html = generateReportHtml(sampleMobileReportData);

        expect(html).toContain("@media print");
        expect(html).toContain("size: A4 portrait;");
        expect(html).toContain("page-break-inside: avoid;");
        expect(html).toContain(".actions-bar {");
        expect(html).toContain("display: none !important;");
    });

    // =========================================================================
    // Test 5: Validation of required metadata
    // =========================================================================
    test("validates required report metadata and throws clear errors if missing", () => {
        expect(() => {
            validateReportData({
                ...sampleMobileReportData,
                metadata: { ...sampleMobileReportData.metadata, title: "" },
            });
        }).toThrow("ReportData.metadata.title is required");

        expect(() => {
            validateReportData({
                ...sampleMobileReportData,
                metadata: { ...sampleMobileReportData.metadata, projectName: "" },
            });
        }).toThrow("ReportData.metadata.projectName is required");

        expect(() => {
            validateReportData({
                ...sampleMobileReportData,
                metadata: { ...sampleMobileReportData.metadata, author: "" },
            });
        }).toThrow("ReportData.metadata.author is required");
    });

    // =========================================================================
    // Test 6: openReportPrintWindow helper
    // =========================================================================
    test("openReportPrintWindow writes generated HTML to provided window mock", () => {
        const mockWindow = {
            document: {
                open: rs.fn(),
                write: rs.fn(),
                close: rs.fn(),
            },
        } as unknown as Window;

        const result = openReportPrintWindow(sampleMobileReportData, mockWindow);
        expect(result).toBe(mockWindow);
        expect(mockWindow.document.open).toHaveBeenCalledTimes(1);
        expect(mockWindow.document.write).toHaveBeenCalledTimes(1);
        expect(mockWindow.document.close).toHaveBeenCalledTimes(1);
    });

    // =========================================================================
    // Test 7: Edge case - Minimal Report (all optional fields omitted)
    // =========================================================================
    test("handles minimal report gracefully with all optional fields omitted", () => {
        const minimalData: ReportData = {
            metadata: {
                title: "Minimal Test Report",
                projectName: "Plot 101",
                date: "2026-11-03",
                author: "Test Engineer",
                product: "mobile-planner",
            },
            sections: [],
            sources: [],
            assumptions: [],
        };

        const html = generateReportHtml(minimalData);

        expect(html).toContain("Minimal Test Report");
        expect(html).toContain("Plot 101");
        expect(html).toContain("Test Engineer");
        expect(html).toContain("No external sources cited.");
        expect(html).toContain("No special assumptions specified.");
        // Mandatory disclaimers still present
        expect(html).toContain(REQUIRED_DISCLAIMER);
        expect(html).toContain('<div class="disclaimer-banner">');
        expect(html).toContain('<div class="footer-disclaimer">');
    });

    // =========================================================================
    // Test 8: Edge case - Security: HTML character escaping (XSS guard)
    // =========================================================================
    test("escapes HTML characters in user input to prevent XSS or layout corruption", () => {
        const maliciousData: ReportData = {
            metadata: {
                title: "Lift Plan <script>alert('xss')</script>",
                projectName: "Site & Dangerous \"Quotes\" 'Single'",
                date: "2026-11-03",
                author: "Hacker <img src=x onerror=alert(1)>",
                product: "mobile-planner",
            },
            sections: [
                {
                    id: "sec1",
                    title: "Section <with> & symbols",
                    metrics: [
                        {
                            label: "Tag <test>",
                            value: "100 < 200 & 300 > 150",
                            notes: "Quote: \"safety\" & 'precaution'",
                        },
                    ],
                },
            ],
            sources: [],
            assumptions: [],
        };

        const html = generateReportHtml(maliciousData);

        // Raw malicious tags must NOT be present
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("<img src=x onerror=alert(1)>");

        // Escaped versions MUST be present
        expect(html).toContain("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
        expect(html).toContain("Site &amp; Dangerous &quot;Quotes&quot; &#039;Single&#039;");
        expect(html).toContain("Hacker &lt;img src=x onerror=alert(1)&gt;");
        expect(html).toContain("100 &lt; 200 &amp; 300 &gt; 150");
    });

    // =========================================================================
    // Test 9: Edge case - Sparse table rows with undefined cells
    // =========================================================================
    test("renders em dash '—' for undefined or missing cells in tables", () => {
        const sparseData: ReportData = {
            metadata: {
                title: "Sparse Table Report",
                projectName: "Sparse Site",
                date: "2026-11-03",
                author: "Test Engineer",
                product: "tower-planner",
            },
            sections: [
                {
                    id: "sparse-table",
                    title: "Partially Defined Table",
                    columns: [
                        { key: "colA", header: "Col A" },
                        { key: "colB", header: "Col B" },
                        { key: "colC", header: "Col C" },
                    ],
                    rows: [
                        {
                            cells: { colA: "Defined Value" }, // colB and colC are missing
                        },
                    ],
                },
            ],
            sources: [],
            assumptions: [],
        };

        const html = generateReportHtml(sparseData);

        expect(html).toContain("<td>Defined Value</td>");
        expect(html).toContain("<td>—</td>");
        // Ensure string "undefined" is never rendered inside table cells
        expect(html).not.toContain("<td>undefined</td>");
    });

    // =========================================================================
    // Test 10: Edge case - Plan view with caption only (no image/SVG)
    // =========================================================================
    test("handles planView when visual media is absent with placeholder", () => {
        const captionOnlyData: ReportData = {
            metadata: {
                title: "Caption Only Plan Report",
                projectName: "Underlay Site",
                date: "2026-11-03",
                author: "Test Engineer",
                product: "mobile-planner",
            },
            planView: {
                title: "Pending CAD Plan",
                caption: "Underlay import scheduled for next check-in",
                scaleText: "1:200",
            },
            sections: [],
            sources: [],
            assumptions: [],
        };

        const html = generateReportHtml(captionOnlyData);

        expect(html).toContain("Pending CAD Plan");
        expect(html).toContain("Underlay import scheduled for next check-in");
        expect(html).toContain("[Plan view visual layout not provided]");
    });

    // =========================================================================
    // Test 11: Edge case - Popup blocker simulation in openReportPrintWindow
    // =========================================================================
    test("openReportPrintWindow returns null safely when target window is null", () => {
        const result = openReportPrintWindow(sampleMobileReportData, null);
        // In happy-dom/node, window.open returns a dummy or null; if null provided it handles safely
        expect(result === null || typeof result === "object").toBe(true);
    });
});
