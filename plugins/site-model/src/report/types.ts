// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export const REPORT_PRODUCTS = ["mobile-planner", "tower-planner"] as const;
export type ReportProduct = (typeof REPORT_PRODUCTS)[number];

/**
 * Status of one metric or table row. The product statuses (OUT_OF_RANGE, INVALID,
 * UNSUPPORTED, NOT_CHECKED) are kept as they are; they must never be turned into
 * PASS or FAIL by the report, because a check that did not run is not a pass.
 */
export const METRIC_STATUSES = [
    "PASS",
    "FAIL",
    "WARN",
    "INFO",
    "OUT_OF_RANGE",
    "INVALID",
    "UNSUPPORTED",
    "NOT_CHECKED",
] as const;
export type MetricStatus = (typeof METRIC_STATUSES)[number];

/** Overall verdict. INCOMPLETE means at least one check did not run. */
export const VERDICT_STATUSES = ["PASS", "FAIL", "WARN", "INCOMPLETE"] as const;
export type VerdictStatus = (typeof VERDICT_STATUSES)[number];

/** Where a number comes from. NOT_STATED is for a value the source does not give. */
export const SOURCE_STATUSES = ["VERIFIED", "INDICATIVE", "LEGACY", "NOT_STATED"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const ASSUMPTION_CATEGORIES = [
    "structural",
    "geotechnical",
    "clearance",
    "operational",
    "general",
] as const;

export interface ReportMetadata {
    readonly title: string;
    readonly projectName: string;
    readonly siteLocation?: string;
    readonly date: string;
    readonly author: string;
    readonly product: ReportProduct;
    readonly disclaimer?: string;
}

export interface ReportPlanView {
    readonly title?: string;
    readonly caption?: string;
    /** Must be a data:image/(png|jpeg|gif|webp|svg+xml) URL. Anything else is rejected. */
    readonly imageDataUrl?: string;
    /**
     * Raw SVG markup. It is never put into the page as markup: it is shown through an
     * <img> data URL, where scripts and event handlers do not run.
     */
    readonly svgContent?: string;
    readonly scaleText?: string;
}

export interface ReportMetric {
    readonly label: string;
    /** A missing value (undefined, null, NaN, Infinity) is printed as an em dash. */
    readonly value: string | number | null | undefined;
    readonly unit?: string;
    readonly status?: MetricStatus;
    readonly notes?: string;
}

export interface ReportTableRow {
    readonly cells: Record<string, string | number | null | undefined>;
    readonly status?: MetricStatus;
}

export interface ReportTableColumn {
    readonly key: string;
    readonly header: string;
    readonly align?: "left" | "center" | "right";
    readonly unit?: string;
}

export interface ReportSection {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    readonly metrics?: readonly ReportMetric[];
    readonly columns?: readonly ReportTableColumn[];
    readonly rows?: readonly ReportTableRow[];
}

export interface ReportSource {
    readonly item: string;
    readonly document: string;
    readonly page?: number | string;
    readonly status: SourceStatus;
}

export interface ReportAssumption {
    readonly category: (typeof ASSUMPTION_CATEGORIES)[number];
    readonly description: string;
}

export interface ReportVerdict {
    readonly status: VerdictStatus;
    readonly title: string;
    readonly summary: string;
}

export interface ReportData {
    readonly metadata: ReportMetadata;
    readonly verdict?: ReportVerdict;
    readonly planView?: ReportPlanView;
    readonly sections: readonly ReportSection[];
    readonly sources: readonly ReportSource[];
    readonly assumptions: readonly ReportAssumption[];
    readonly notes?: readonly string[];
}
