// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { generateReportHtml, openReportPrintWindow, type ReportData, validateReportData } from "../src";

// Tests for the review points on PR #10 (Sir's 2 must-fix and Anjali's 9 points).
// All fixture numbers here are made up for the tests (INDICATIVE), not published values.

const base: ReportData = {
    metadata: {
        title: "Review Test Report",
        projectName: "Review Site",
        date: "2026-11-07",
        author: "Test Engineer",
        product: "mobile-planner",
    },
    sections: [],
    sources: [],
    assumptions: [],
};

const withData = (patch: Partial<ReportData>): ReportData => ({ ...base, ...patch });
const asAny = (v: unknown) => v as never;
// The page body without the <style> block (class names also appear in the stylesheet).
const bodyOf = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, "");

describe("S7 review: SVG and image safety (Sir must-fix 1)", () => {
    const evil =
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg><script>alert(2)</script>';

    test("svgContent with <script> and onload is never put into the page as markup", () => {
        const html = generateReportHtml(withData({ planView: { svgContent: evil } }));
        expect(html).not.toContain("<script>alert");
        expect(html).not.toContain("onload=");
        expect(html).toContain('<img class="plan-view-image" src="data:image/svg+xml;charset=utf-8,%3Csvg');
        // The only <script-like text left is percent-encoded inside the data URL.
        expect(html).toContain("%3Cscript%3Ealert(1)");
    });

    test("svgContent that is not an <svg> document is replaced by the placeholder", () => {
        const html = generateReportHtml(
            withData({ planView: { svgContent: '<div onclick="alert(1)">x</div>' } }),
        );
        expect(html).not.toContain('onclick="alert');
        expect(html).toContain("[Plan view visual layout not provided]");
    });

    test("imageDataUrl must be a data:image URL", () => {
        for (const bad of [
            "javascript:alert(1)",
            "https://example.com/plan.png",
            "data:text/html,<b>x</b>",
        ]) {
            expect(() => generateReportHtml(withData({ planView: { imageDataUrl: bad } }))).toThrow(
                RangeError,
            );
        }
        expect(() =>
            generateReportHtml(withData({ planView: { imageDataUrl: "data:image/png;base64,AAAA" } })),
        ).not.toThrow();
    });

    test("unknown status, source status, category and align are rejected (they go into class names)", () => {
        const injected = 'PASS" onclick="alert(1)';
        expect(() =>
            generateReportHtml(
                withData({
                    sections: [
                        { id: "a", title: "A", metrics: [{ label: "x", value: 1, status: asAny(injected) }] },
                    ],
                }),
            ),
        ).toThrow(RangeError);
        expect(() =>
            generateReportHtml(withData({ verdict: { status: asAny(injected), title: "t", summary: "s" } })),
        ).toThrow(RangeError);
        expect(() =>
            generateReportHtml(
                withData({ sources: [{ item: "i", document: "d", status: asAny(injected) }] }),
            ),
        ).toThrow(RangeError);
        expect(() =>
            generateReportHtml(withData({ assumptions: [{ category: asAny("secret"), description: "d" }] })),
        ).toThrow(RangeError);
        expect(() =>
            generateReportHtml(
                withData({
                    sections: [
                        {
                            id: "a",
                            title: "A",
                            columns: [{ key: "k", header: "K", align: asAny('left" onclick="x') }],
                            rows: [{ cells: { k: 1 } }],
                        },
                    ],
                }),
            ),
        ).toThrow(RangeError);
    });
});

describe("S7 review: metadata validation (Anjali 5)", () => {
    test("blank title, project name or author is rejected", () => {
        for (const key of ["title", "projectName", "author"] as const) {
            for (const bad of ["", "   "]) {
                expect(() =>
                    validateReportData(withData({ metadata: { ...base.metadata, [key]: bad } })),
                ).toThrow(RangeError);
            }
        }
    });

    test("date must be a real YYYY-MM-DD date", () => {
        for (const bad of ["", "03-11-2026", "2026-2-3", "2026-02-30", "2026-13-01", "today"]) {
            expect(() => validateReportData(withData({ metadata: { ...base.metadata, date: bad } }))).toThrow(
                RangeError,
            );
        }
        expect(() =>
            validateReportData(withData({ metadata: { ...base.metadata, date: "2028-02-29" } })),
        ).not.toThrow();
    });

    test("an unknown product is rejected instead of being labelled Tower Crane Planner", () => {
        expect(() =>
            generateReportHtml(
                withData({ metadata: { ...base.metadata, product: asAny("crawler-planner") } }),
            ),
        ).toThrow(RangeError);
        expect(generateReportHtml(base)).toContain("Mobile Crane Lift Planner");
        expect(
            generateReportHtml(withData({ metadata: { ...base.metadata, product: "tower-planner" } })),
        ).toContain("Tower Crane Planner");
    });
});

describe("S7 review: product statuses and verdicts are kept (Anjali 1)", () => {
    const rows = (["OUT_OF_RANGE", "INVALID", "UNSUPPORTED", "NOT_CHECKED"] as const).map((status) => ({
        cells: { pick: status.toLowerCase() },
        status,
    }));

    test("OUT_OF_RANGE, INVALID, UNSUPPORTED and NOT_CHECKED are printed as they are, never as PASS", () => {
        const html = generateReportHtml(
            withData({
                sections: [{ id: "picks", title: "Picks", columns: [{ key: "pick", header: "Pick" }], rows }],
            }),
        );
        for (const s of ["OUT_OF_RANGE", "INVALID", "UNSUPPORTED", "NOT_CHECKED"]) {
            expect(html).toContain(`<span class="badge badge-${s}">${s}</span>`);
            expect(html).toContain(`class="row-status-${s}"`);
        }
        expect(html).not.toContain('<span class="badge badge-PASS">');
    });

    test("INCOMPLETE verdict is shown as INCOMPLETE, not PASS", () => {
        const html = generateReportHtml(
            withData({
                verdict: {
                    status: "INCOMPLETE",
                    title: "Lift check",
                    summary: "Ground bearing was not checked.",
                },
            }),
        );
        expect(html).toContain("verdict-INCOMPLETE");
        expect(html).toContain("Lift check — INCOMPLETE");
        expect(bodyOf(html)).not.toContain("verdict-PASS");
    });

    test("NOT_STATED is a valid source status and is printed", () => {
        const html = generateReportHtml(
            withData({
                sources: [{ item: "Heaviest component", document: "Packing list", status: "NOT_STATED" }],
            }),
        );
        expect(html).toContain('<span class="badge badge-NOT_STATED">NOT_STATED</span>');
    });
});

describe("S7 review: row status indicators (Anjali 2)", () => {
    const section = (rowsIn: ReportData["sections"][number]["rows"]) =>
        withData({
            sections: [{ id: "t", title: "T", columns: [{ key: "k", header: "K" }], rows: rowsIn }],
        });

    test("a row with a status gets a Status column with a text badge, and CSS for the row colour", () => {
        const html = generateReportHtml(
            section([{ cells: { k: "a" }, status: "FAIL" }, { cells: { k: "b" } }]),
        );
        expect(html).toContain('<th class="align-center">Status</th>');
        expect(html).toContain('<td class="align-center"><span class="badge badge-FAIL">FAIL</span></td>');
        expect(html).toContain('<td class="align-center">—</td>');
        expect(html).toContain("tr.row-status-FAIL td");
        expect(html).toContain("print-color-adjust: exact;");
    });

    test("no Status column when no row has a status", () => {
        const html = generateReportHtml(section([{ cells: { k: "a" } }]));
        expect(html).not.toContain(">Status</th>");
    });
});

describe("S7 review: notes are rendered (Anjali 3)", () => {
    test("notes are printed, escaped, and blank notes are skipped", () => {
        const html = generateReportHtml(
            withData({ notes: ["Check <b>wind</b> on the day", "  ", "Second note"] }),
        );
        expect(html).toContain('<div class="section-heading">Notes</div>');
        expect(html).toContain("<li>Check &lt;b&gt;wind&lt;/b&gt; on the day</li>");
        expect(html).toContain("<li>Second note</li>");
        expect(html.match(/<li>/g)?.length).toBe(2);
    });

    test("no Notes heading when there are no notes", () => {
        expect(generateReportHtml(base)).not.toContain('<div class="section-heading">Notes</div>');
        expect(generateReportHtml(withData({ notes: [] }))).not.toContain(
            '<div class="section-heading">Notes</div>',
        );
    });
});

describe("S7 review: missing values (Anjali 4)", () => {
    const bad: Array<string | number | null | undefined> = [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        undefined,
        null,
        "",
        "NaN",
        "undefined",
        "null",
        "-Infinity",
    ];

    test("metric values NaN, Infinity, undefined, null and their text forms print as an em dash, without the unit", () => {
        const html = generateReportHtml(
            withData({
                sections: [
                    {
                        id: "m",
                        title: "M",
                        metrics: bad.map((value, i) => ({
                            label: `m${i}`,
                            value,
                            unit: "zzunit",
                            status: "NOT_CHECKED" as const,
                        })),
                    },
                ],
            }),
        );
        expect(html.match(/<span class="metric-value">—<\/span>/g)?.length).toBe(bad.length);
        expect(html).not.toContain("zzunit");
        expect(html).not.toMatch(/>\s*(NaN|undefined|null|-?Infinity)\s*</);
    });

    test("a real value keeps its unit; zero is a real value", () => {
        const html = generateReportHtml(
            withData({
                sections: [
                    { id: "m", title: "M", metrics: [{ label: "z", value: 0, unit: "kN", status: "INFO" }] },
                ],
            }),
        );
        expect(html).toContain('<span class="metric-value">0<span class="metric-unit">kN</span></span>');
    });

    test("a PASS metric with no usable value is rejected; other statuses may have no value", () => {
        for (const value of [Number.NaN, undefined, null, ""]) {
            expect(() =>
                generateReportHtml(
                    withData({
                        sections: [{ id: "m", title: "M", metrics: [{ label: "x", value, status: "PASS" }] }],
                    }),
                ),
            ).toThrow(RangeError);
        }
        expect(() =>
            generateReportHtml(
                withData({
                    sections: [
                        {
                            id: "m",
                            title: "M",
                            metrics: [{ label: "x", value: undefined, status: "NOT_CHECKED" }],
                        },
                    ],
                }),
            ),
        ).not.toThrow();
    });

    test("table cells with NaN, null or Infinity print as an em dash", () => {
        const html = generateReportHtml(
            withData({
                sections: [
                    {
                        id: "t",
                        title: "T",
                        columns: [
                            { key: "a", header: "A" },
                            { key: "b", header: "B" },
                            { key: "c", header: "C" },
                        ],
                        rows: [{ cells: { a: Number.NaN, b: null, c: Number.POSITIVE_INFINITY } }],
                    },
                ],
            }),
        );
        expect(html.match(/<td>—<\/td>/g)?.length).toBe(3);
    });
});

describe("S7 review: plan view scale text (Anjali 7)", () => {
    test("scale text alone, caption alone, and both", () => {
        const scaleOnly = generateReportHtml(withData({ planView: { scaleText: "1:500" } }));
        expect(scaleOnly).toContain('<div class="plan-view-caption">1:500</div>');
        const capOnly = generateReportHtml(withData({ planView: { caption: "Plan of site" } }));
        expect(capOnly).toContain('<div class="plan-view-caption">Plan of site</div>');
        const both = generateReportHtml(
            withData({ planView: { caption: "Plan of site", scaleText: "1:500" } }),
        );
        expect(both).toContain('<div class="plan-view-caption">Plan of site (1:500)</div>');
        const neither = generateReportHtml(withData({ planView: {} }));
        expect(bodyOf(neither)).not.toContain("plan-view-caption");
    });
});

describe("S7 review: popup blocker (Anjali 8)", () => {
    test("returns null and does not throw when window.open is blocked (returns null)", () => {
        const spy = rs.spyOn(window, "open").mockReturnValue(null);
        try {
            expect(openReportPrintWindow(base)).toBeNull();
            expect(spy).toHaveBeenCalledWith("", "_blank");
        } finally {
            spy.mockRestore();
        }
    });

    test("writes the full report, with the disclaimer, into the window it is given", () => {
        const write = rs.fn();
        const fake = { document: { open: rs.fn(), write, close: rs.fn() } } as unknown as Window;
        expect(openReportPrintWindow(base, fake)).toBe(fake);
        expect(write).toHaveBeenCalledTimes(1);
        expect(String(write.mock.calls[0][0])).toContain("Planning aid, not a certified lift plan.");
    });
});
