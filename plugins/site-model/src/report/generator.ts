// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { REQUIRED_DISCLAIMER } from "../types";
import type {
    ReportAssumption,
    ReportData,
    ReportMetric,
    ReportSection,
    ReportSource,
    ReportTableColumn,
    ReportTableRow,
} from "./types";

/**
 * Escapes HTML characters to prevent XSS or broken formatting in generated reports.
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Generates the print and screen stylesheet for the report.
 */
function getReportStyles(): string {
    return `
        :root {
            --primary: #1e3a8a;
            --primary-light: #eff6ff;
            --text-main: #0f172a;
            --text-muted: #475569;
            --border: #cbd5e1;
            --bg-table-header: #f8fafc;
            --pass-bg: #dcfce7;
            --pass-text: #166534;
            --fail-bg: #fee2e2;
            --fail-text: #991b1b;
            --warn-bg: #fef3c7;
            --warn-text: #92400e;
            --info-bg: #e0f2fe;
            --info-text: #075985;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: var(--text-main);
            background: #f1f5f9;
            padding: 24px;
            font-size: 13px;
            line-height: 1.5;
        }

        .report-sheet {
            max-width: 960px;
            margin: 0 auto;
            background: #ffffff;
            padding: 36px 44px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
            border-radius: 4px;
        }

        .actions-bar {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 16px;
        }

        .btn-print {
            background: var(--primary);
            color: #ffffff;
            border: none;
            padding: 8px 18px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s ease;
        }

        .btn-print:hover {
            background: #1d4ed8;
        }

        .disclaimer-banner {
            background: #fffbeb;
            border: 2px solid #f59e0b;
            color: #78350f;
            padding: 10px 14px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .report-header {
            border-bottom: 2px solid var(--primary);
            padding-bottom: 16px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .report-title-area h1 {
            font-size: 24px;
            color: var(--primary);
            margin-bottom: 4px;
            font-weight: 700;
        }

        .report-title-area h2 {
            font-size: 14px;
            color: var(--text-muted);
            font-weight: 500;
        }

        .report-meta-table {
            border-collapse: collapse;
            font-size: 12px;
        }

        .report-meta-table td {
            padding: 3px 8px;
        }

        .report-meta-table td.label {
            color: var(--text-muted);
            font-weight: 600;
            text-align: right;
        }

        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-PASS { background: var(--pass-bg); color: var(--pass-text); }
        .badge-FAIL { background: var(--fail-bg); color: var(--fail-text); }
        .badge-WARN { background: var(--warn-bg); color: var(--warn-text); }
        .badge-INFO { background: var(--info-bg); color: var(--info-text); }
        .badge-INDICATIVE { background: #ffedd5; color: #9a3412; border: 1px solid #fdba74; }
        .badge-VERIFIED { background: #dcfce7; color: #166534; }
        .badge-LEGACY { background: #f1f5f9; color: #475569; }

        .verdict-box {
            padding: 14px 18px;
            border-radius: 4px;
            margin-bottom: 24px;
            border: 1px solid transparent;
        }

        .verdict-box.verdict-PASS {
            background: var(--pass-bg);
            border-color: #86efac;
            color: var(--pass-text);
        }

        .verdict-box.verdict-FAIL {
            background: var(--fail-bg);
            border-color: #fca5a5;
            color: var(--fail-text);
        }

        .verdict-box.verdict-WARN {
            background: var(--warn-bg);
            border-color: #fde68a;
            color: var(--warn-text);
        }

        .verdict-title {
            font-size: 15px;
            font-weight: 700;
            margin-bottom: 4px;
        }

        .plan-view-container {
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 24px;
            background: #fafafa;
            text-align: center;
        }

        .plan-view-image {
            max-width: 100%;
            height: auto;
            max-height: 380px;
            display: block;
            margin: 0 auto 8px;
            border: 1px solid #e2e8f0;
            background: #ffffff;
        }

        .plan-view-caption {
            font-size: 11px;
            color: var(--text-muted);
            font-style: italic;
        }

        .section-block {
            margin-bottom: 24px;
            page-break-inside: avoid;
        }

        .section-heading {
            font-size: 15px;
            color: var(--primary);
            font-weight: 700;
            margin-bottom: 8px;
            padding-bottom: 4px;
            border-bottom: 1px solid var(--border);
        }

        .section-desc {
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 10px;
        }

        table.data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 10px;
        }

        table.data-table th, table.data-table td {
            border: 1px solid var(--border);
            padding: 7px 10px;
            text-align: left;
        }

        table.data-table th {
            background: var(--bg-table-header);
            font-weight: 600;
            color: var(--text-main);
        }

        table.data-table tr:nth-child(even) td {
            background: #fcfcfd;
        }

        .align-left { text-align: left; }
        .align-center { text-align: center; }
        .align-right { text-align: right; }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
            gap: 12px;
            margin-bottom: 12px;
        }

        .metric-card {
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 10px 12px;
            background: #ffffff;
        }

        .metric-label {
            font-size: 11px;
            color: var(--text-muted);
            font-weight: 500;
            margin-bottom: 2px;
        }

        .metric-val-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
        }

        .metric-value {
            font-size: 17px;
            font-weight: 700;
            color: var(--text-main);
        }

        .metric-unit {
            font-size: 11px;
            color: var(--text-muted);
            margin-left: 4px;
            font-weight: normal;
        }

        .metric-notes {
            font-size: 10px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        ul.assumptions-list {
            list-style: disc;
            margin-left: 20px;
            font-size: 12px;
            color: var(--text-muted);
        }

        ul.assumptions-list li {
            margin-bottom: 4px;
        }

        .report-footer {
            margin-top: 36px;
            padding-top: 16px;
            border-top: 1px solid var(--border);
            text-align: center;
            font-size: 11px;
            color: var(--text-muted);
        }

        .footer-disclaimer {
            font-weight: 700;
            color: #b45309;
            margin-bottom: 4px;
        }

        @media print {
            body {
                background: #ffffff;
                padding: 0;
                font-size: 11pt;
            }

            .actions-bar {
                display: none !important;
            }

            .report-sheet {
                box-shadow: none;
                padding: 0;
                max-width: 100%;
            }

            @page {
                size: A4 portrait;
                margin: 14mm 12mm 16mm 12mm;
            }

            .section-block {
                page-break-inside: avoid;
            }

            table.data-table {
                page-break-inside: auto;
            }

            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
        }
    `;
}

function renderMetricsSection(metrics: readonly ReportMetric[]): string {
    const cards = metrics.map((m) => {
        const statusBadge = m.status ? `<span class="badge badge-${m.status}">${m.status}</span>` : "";
        const unitHtml = m.unit ? `<span class="metric-unit">${escapeHtml(m.unit)}</span>` : "";
        const notesHtml = m.notes ? `<div class="metric-notes">${escapeHtml(m.notes)}</div>` : "";
        return `
            <div class="metric-card">
                <div class="metric-label">${escapeHtml(m.label)}</div>
                <div class="metric-val-row">
                    <span class="metric-value">${escapeHtml(String(m.value))}${unitHtml}</span>
                    ${statusBadge}
                </div>
                ${notesHtml}
            </div>
        `;
    });
    return `<div class="metrics-grid">${cards.join("")}</div>`;
}

function renderTableSection(columns: readonly ReportTableColumn[], rows: readonly ReportTableRow[]): string {
    const headerCells = columns
        .map((c) => {
            const unit = c.unit ? ` (${escapeHtml(c.unit)})` : "";
            const alignAttr = c.align ? ` class="align-${c.align}"` : "";
            return `<th${alignAttr}>${escapeHtml(c.header)}${unit}</th>`;
        })
        .join("");

    const bodyRows = rows
        .map((r) => {
            const rowCells = columns
                .map((c) => {
                    const rawVal = r.cells[c.key];
                    const val = rawVal !== undefined ? escapeHtml(String(rawVal)) : "—";
                    const alignAttr = c.align ? ` class="align-${c.align}"` : "";
                    return `<td${alignAttr}>${val}</td>`;
                })
                .join("");
            const statusClass = r.status ? ` class="row-status-${r.status}"` : "";
            return `<tr${statusClass}>${rowCells}</tr>`;
        })
        .join("");

    return `
        <table class="data-table">
            <thead>
                <tr>${headerCells}</tr>
            </thead>
            <tbody>
                ${bodyRows}
            </tbody>
        </table>
    `;
}

function renderSourcesTable(sources: readonly ReportSource[]): string {
    if (sources.length === 0) {
        return '<p class="section-desc">No external sources cited.</p>';
    }
    const rows = sources
        .map((s) => {
            const pageStr = s.page !== undefined ? `Page ${escapeHtml(String(s.page))}` : "—";
            return `
                <tr>
                    <td><strong>${escapeHtml(s.item)}</strong></td>
                    <td>${escapeHtml(s.document)}</td>
                    <td>${pageStr}</td>
                    <td><span class="badge badge-${s.status}">${s.status}</span></td>
                </tr>
            `;
        })
        .join("");

    return `
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 25%;">Item / Parameter</th>
                    <th style="width: 45%;">Source Document</th>
                    <th style="width: 15%;">Reference / Page</th>
                    <th style="width: 15%;">Status</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

function renderAssumptions(assumptions: readonly ReportAssumption[]): string {
    if (assumptions.length === 0) {
        return '<p class="section-desc">No special assumptions specified.</p>';
    }
    const items = assumptions
        .map(
            (a) =>
                `<li><strong>[${escapeHtml(a.category.toUpperCase())}]</strong> ${escapeHtml(a.description)}</li>`,
        )
        .join("");
    return `<ul class="assumptions-list">${items}</ul>`;
}

/**
 * Validates report data to ensure safety rules and legal standards are met.
 * Specifically checks that the mandatory disclaimer is present.
 */
export function validateReportData(data: ReportData): void {
    if (!data.metadata?.title) {
        throw new Error("ReportData.metadata.title is required");
    }
    if (!data.metadata?.projectName) {
        throw new Error("ReportData.metadata.projectName is required");
    }
    if (!data.metadata?.author) {
        throw new Error("ReportData.metadata.author is required");
    }
}

/**
 * Generates a self-contained, print-ready HTML document for the given ReportData.
 * Implements S7 shared report helper across both mobile-planner and tower-planner.
 */
export function generateReportHtml(data: ReportData): string {
    validateReportData(data);

    // Enforce the immutable legal disclaimer
    const disclaimer = REQUIRED_DISCLAIMER;

    const productName =
        data.metadata.product === "mobile-planner" ? "Mobile Crane Lift Planner" : "Tower Crane Planner";

    // Verdict box
    let verdictHtml = "";
    if (data.verdict) {
        verdictHtml = `
            <div class="verdict-box verdict-${data.verdict.status}">
                <div class="verdict-title">${escapeHtml(data.verdict.title)} — ${data.verdict.status}</div>
                <div>${escapeHtml(data.verdict.summary)}</div>
            </div>
        `;
    }

    // Plan view container
    let planViewHtml = "";
    if (data.planView) {
        let content = "";
        if (data.planView.imageDataUrl) {
            content = `<img class="plan-view-image" src="${escapeHtml(data.planView.imageDataUrl)}" alt="Site Plan View" />`;
        } else if (data.planView.svgContent) {
            content = `<div class="plan-view-image">${data.planView.svgContent}</div>`;
        } else {
            content = `<div class="plan-view-placeholder" style="padding: 24px; color: var(--text-muted); font-style: italic;">[Plan view visual layout not provided]</div>`;
        }
        const caption = data.planView.caption
            ? `<div class="plan-view-caption">${escapeHtml(data.planView.caption)}${data.planView.scaleText ? ` (${escapeHtml(data.planView.scaleText)})` : ""}</div>`
            : "";
        planViewHtml = `
            <div class="section-block">
                <div class="section-heading">${escapeHtml(data.planView.title ?? "Site Plan & Crane Setup View")}</div>
                <div class="plan-view-container">
                    ${content}
                    ${caption}
                </div>
            </div>
        `;
    }

    // Dynamic sections
    const sectionsHtml = data.sections
        .map((sec: ReportSection) => {
            const descHtml = sec.description
                ? `<div class="section-desc">${escapeHtml(sec.description)}</div>`
                : "";
            let contentHtml = "";
            if (sec.metrics && sec.metrics.length > 0) {
                contentHtml += renderMetricsSection(sec.metrics);
            }
            if (sec.columns && sec.rows) {
                contentHtml += renderTableSection(sec.columns, sec.rows);
            }
            return `
                <div class="section-block">
                    <div class="section-heading">${escapeHtml(sec.title)}</div>
                    ${descHtml}
                    ${contentHtml}
                </div>
            `;
        })
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(data.metadata.title)} - DGOC Crane Planner</title>
    <style>${getReportStyles()}</style>
</head>
<body>
    <div class="report-sheet">
        <div class="actions-bar">
            <button class="btn-print" onclick="window.print()">Print / Save PDF</button>
        </div>

        <div class="disclaimer-banner">
            ⚠️ <strong>SAFETY NOTICE:</strong> ${escapeHtml(disclaimer)}
        </div>

        <header class="report-header">
            <div class="report-title-area">
                <h1>${escapeHtml(data.metadata.title)}</h1>
                <h2>Project: ${escapeHtml(data.metadata.projectName)}</h2>
            </div>
            <table class="report-meta-table">
                <tr><td class="label">Date:</td><td>${escapeHtml(data.metadata.date)}</td></tr>
                <tr><td class="label">Planner:</td><td>${escapeHtml(data.metadata.author)}</td></tr>
                <tr><td class="label">Product:</td><td>${escapeHtml(productName)}</td></tr>
                ${data.metadata.siteLocation ? `<tr><td class="label">Site:</td><td>${escapeHtml(data.metadata.siteLocation)}</td></tr>` : ""}
            </table>
        </header>

        ${verdictHtml}
        ${planViewHtml}
        ${sectionsHtml}

        <div class="section-block">
            <div class="section-heading">Sources & Standards</div>
            <p class="section-desc">Traceability records for crane specifications, charts, and limits.</p>
            ${renderSourcesTable(data.sources)}
        </div>

        <div class="section-block">
            <div class="section-heading">Assumptions & Limitations</div>
            ${renderAssumptions(data.assumptions)}
        </div>

        <footer class="report-footer">
            <div class="footer-disclaimer">${escapeHtml(disclaimer)}</div>
            <div>Generated by DGOC Crane Planner • Open Source Web CAD (AGPL-3.0)</div>
        </footer>
    </div>
</body>
</html>`;
}

/**
 * Triggers a new window with the generated report and initiates browser print.
 */
export function openReportPrintWindow(data: ReportData, targetWindow?: Window | null): Window | null {
    const html = generateReportHtml(data);
    const w = targetWindow ?? window.open("", "_blank");
    if (!w) {
        return null;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    return w;
}
