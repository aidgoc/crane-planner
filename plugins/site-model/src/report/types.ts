// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export type ReportProduct = "mobile-planner" | "tower-planner";

export type MetricStatus = "PASS" | "FAIL" | "WARN" | "INFO";

export type SourceStatus = "VERIFIED" | "INDICATIVE" | "LEGACY";

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
    readonly imageDataUrl?: string;
    readonly svgContent?: string;
    readonly scaleText?: string;
}

export interface ReportMetric {
    readonly label: string;
    readonly value: string | number;
    readonly unit?: string;
    readonly status?: MetricStatus;
    readonly notes?: string;
}

export interface ReportTableRow {
    readonly cells: Record<string, string | number | undefined>;
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
    readonly category: "structural" | "geotechnical" | "clearance" | "operational" | "general";
    readonly description: string;
}

export interface ReportVerdict {
    readonly status: "PASS" | "FAIL" | "WARN";
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
