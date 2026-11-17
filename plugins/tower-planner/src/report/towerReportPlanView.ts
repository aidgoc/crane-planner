// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { ReportPlanView } from "../../../site-model/src/report";
import type { PickPoint } from "../pickEngine";
import type { TowerReportPick, TowerReportSnapshot } from "./towerReportTypes";

/**
 * Fixed schematic viewport. The image is deliberately not a scaled drawing:
 * fitting and padding change the scale for every report, so the view carries
 * no measurement and is labelled "Schematic — not to scale".
 */
export const TOWER_PLAN_VIEW_WIDTH = 720;
export const TOWER_PLAN_VIEW_HEIGHT = 480;

/** Scale disclosure printed by S7 below the image. */
export const TOWER_PLAN_SCALE_TEXT = "Schematic — not to scale";

const PADDING = 56;
const MARKER_RADIUS = 5;
const DROP_HALF_SIZE = 5;
const MAST_HALF_SIZE = 7;

const DESCRIPTION =
    "Schematic plan view of the captured tower pick check. It shows the mast position, one dashed governing hook-radius ring per pick, and the captured pick-up and set-down points. It does not show a verified swing path, jib orientation, clearance or a site boundary, and it is not to scale.";

const NOTE_LINES = [
    "Schematic — not to scale.",
    "Dashed rings show governing hook radii from the mast. No swing path, jib orientation, clearance or site boundary is shown.",
];

/** Deterministic ring/marker colours, indexed by pick order. */
const PICK_COLORS = ["#0b62c4", "#c2410c", "#15803d", "#7c3aed", "#b91c1c", "#0f766e"] as const;

interface ProjectedPoint {
    readonly x: number;
    readonly y: number;
}

interface PlanPick {
    readonly label: string;
    readonly color: string;
    readonly radiusM: number;
    readonly supply: PickPoint;
    readonly drop: PickPoint;
}

interface PlanProjection {
    readonly scale: number;
    readonly project: (point: PickPoint) => ProjectedPoint;
}

function isFinitePoint(point: PickPoint | null | undefined): point is PickPoint {
    return !!point && typeof point === "object" && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Round to millimetres of screen space so repeated builds produce identical text. */
function formatNumber(value: number): string {
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function pickLabel(pick: TowerReportPick, index: number): string {
    return pick.label.trim().length > 0 ? pick.label : `Pick ${index + 1}`;
}

/**
 * Require genuine geometry for every included pick. A missing coordinate or a
 * non-positive/non-finite radius omits the whole plan view: plotting a subset,
 * drawing a pick without its ring, or inferring a point from a radius would
 * invent geometry.
 */
function planPicks(snapshot: TowerReportSnapshot): PlanPick[] | undefined {
    if (snapshot.picks.length === 0) return undefined;

    const picks: PlanPick[] = [];
    for (const [index, pick] of snapshot.picks.entries()) {
        const radiusM = pick.radiusM;
        if (typeof radiusM !== "number" || !Number.isFinite(radiusM) || radiusM <= 0) {
            return undefined;
        }
        if (!isFinitePoint(pick.supply) || !isFinitePoint(pick.drop)) {
            return undefined;
        }
        picks.push({
            label: pickLabel(pick, index),
            color: PICK_COLORS[index % PICK_COLORS.length],
            radiusM,
            supply: { x: pick.supply.x, y: pick.supply.y },
            drop: { x: pick.drop.x, y: pick.drop.y },
        });
    }
    return picks;
}

/**
 * Fit the mast, every governing-radius ring and every pick point into the fixed
 * viewport. Site +X points right and site +Y points up, so the screen Y axis is
 * inverted. The two axes share one scale, which keeps circles circular.
 */
function createProjection(mast: PickPoint, picks: readonly PlanPick[]): PlanProjection | undefined {
    let minX = mast.x;
    let maxX = mast.x;
    let minY = mast.y;
    let maxY = mast.y;

    for (const pick of picks) {
        minX = Math.min(minX, pick.supply.x, pick.drop.x, mast.x - pick.radiusM);
        maxX = Math.max(maxX, pick.supply.x, pick.drop.x, mast.x + pick.radiusM);
        minY = Math.min(minY, pick.supply.y, pick.drop.y, mast.y - pick.radiusM);
        maxY = Math.max(maxY, pick.supply.y, pick.drop.y, mast.y + pick.radiusM);
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    if (![spanX, spanY, centerX, centerY].every(Number.isFinite)) return undefined;

    const usableWidth = TOWER_PLAN_VIEW_WIDTH - PADDING * 2;
    const usableHeight = TOWER_PLAN_VIEW_HEIGHT - PADDING * 2;
    const fitted = Math.min(
        spanX > 0 ? usableWidth / spanX : Number.POSITIVE_INFINITY,
        spanY > 0 ? usableHeight / spanY : Number.POSITIVE_INFINITY,
    );
    const scale = Number.isFinite(fitted) ? fitted : 1;

    return {
        scale,
        project: (point: PickPoint): ProjectedPoint => ({
            x: TOWER_PLAN_VIEW_WIDTH / 2 + (point.x - centerX) * scale,
            y: TOWER_PLAN_VIEW_HEIGHT / 2 - (point.y - centerY) * scale,
        }),
    };
}

function isFiniteProjection(point: ProjectedPoint): boolean {
    return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function textElement(
    className: string,
    x: number,
    y: number,
    text: string,
    anchor: "start" | "middle" | "end",
    fill: string,
    size: number,
): string {
    const attributes = [
        `class="${className}"`,
        `x="${formatNumber(x)}"`,
        `y="${formatNumber(y)}"`,
        `text-anchor="${anchor}"`,
        'font-family="Arial, Helvetica, sans-serif"',
        `font-size="${size}"`,
        `fill="${fill}"`,
    ];
    return `<text ${attributes.join(" ")}>${escapeXml(text)}</text>`;
}

/** Place a marker label on the side of the viewport that has room for it. */
function sideLabel(screenX: number): { readonly x: number; readonly anchor: "start" | "end" } {
    return screenX >= TOWER_PLAN_VIEW_WIDTH / 2
        ? { x: screenX - MARKER_RADIUS - 4, anchor: "end" }
        : { x: screenX + MARKER_RADIUS + 4, anchor: "start" };
}

/**
 * Render the schematic plan view as an SVG document string. Returns `undefined`
 * when the mast, a governing radius or a supply/drop point is missing,
 * non-positive or non-finite, so the caller omits the plan view instead of
 * inventing geometry.
 */
export function renderTowerPlanViewSvg(snapshot: TowerReportSnapshot): string | undefined {
    if (!isFinitePoint(snapshot.placement)) return undefined;

    const picks = planPicks(snapshot);
    if (picks === undefined) return undefined;

    const mast = { x: snapshot.placement.x, y: snapshot.placement.y };
    const projection = createProjection(mast, picks);
    if (projection === undefined) return undefined;

    const mastScreen = projection.project(mast);
    if (!isFiniteProjection(mastScreen)) return undefined;

    const rendered: {
        readonly pick: PlanPick;
        readonly supply: ProjectedPoint;
        readonly drop: ProjectedPoint;
    }[] = [];
    for (const pick of picks) {
        const supply = projection.project(pick.supply);
        const drop = projection.project(pick.drop);
        if (!isFiniteProjection(supply) || !isFiniteProjection(drop)) return undefined;
        rendered.push({ pick, supply, drop });
    }

    const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${TOWER_PLAN_VIEW_WIDTH}" height="${TOWER_PLAN_VIEW_HEIGHT}" viewBox="0 0 ${TOWER_PLAN_VIEW_WIDTH} ${TOWER_PLAN_VIEW_HEIGHT}">`,
        `<title>${escapeXml("Tower pick plan view")}</title>`,
        `<desc>${escapeXml(DESCRIPTION)}</desc>`,
        `<rect class="plan-background" x="0" y="0" width="${TOWER_PLAN_VIEW_WIDTH}" height="${TOWER_PLAN_VIEW_HEIGHT}" fill="#ffffff" />`,
        textElement("plan-axis-note", 16, 24, "Site axes: +X →, +Y ↑ (metres)", "start", "#475569", 11),
    ];

    for (const item of rendered) {
        const radius = item.pick.radiusM * projection.scale;
        if (!Number.isFinite(radius)) return undefined;
        parts.push(
            `<circle class="plan-ring" cx="${formatNumber(mastScreen.x)}" cy="${formatNumber(mastScreen.y)}" r="${formatNumber(radius)}" fill="none" stroke="${item.pick.color}" stroke-width="1.5" stroke-dasharray="6 4" />`,
        );
    }

    parts.push(
        `<rect class="plan-mast-marker" x="${formatNumber(mastScreen.x - MAST_HALF_SIZE)}" y="${formatNumber(mastScreen.y - MAST_HALF_SIZE)}" width="${MAST_HALF_SIZE * 2}" height="${MAST_HALF_SIZE * 2}" fill="#111827" />`,
    );

    for (const item of rendered) {
        const supplyLabel = sideLabel(item.supply.x);
        const dropLabel = sideLabel(item.drop.x);
        const supplyText = `${item.pick.label} pick-up (${formatNumber(item.pick.supply.x)}, ${formatNumber(item.pick.supply.y)})`;
        const dropText = `${item.pick.label} set-down (${formatNumber(item.pick.drop.x)}, ${formatNumber(item.pick.drop.y)})`;

        parts.push(
            `<circle class="plan-supply-marker" cx="${formatNumber(item.supply.x)}" cy="${formatNumber(item.supply.y)}" r="${MARKER_RADIUS}" fill="${item.pick.color}" />`,
            textElement(
                "plan-supply-label",
                supplyLabel.x,
                item.supply.y + MARKER_RADIUS + 11,
                supplyText,
                supplyLabel.anchor,
                item.pick.color,
                11,
            ),
            `<rect class="plan-drop-marker" x="${formatNumber(item.drop.x - DROP_HALF_SIZE)}" y="${formatNumber(item.drop.y - DROP_HALF_SIZE)}" width="${DROP_HALF_SIZE * 2}" height="${DROP_HALF_SIZE * 2}" fill="#ffffff" stroke="${item.pick.color}" stroke-width="2" />`,
            textElement(
                "plan-drop-label",
                dropLabel.x,
                item.drop.y - DROP_HALF_SIZE - 6,
                dropText,
                dropLabel.anchor,
                item.pick.color,
                11,
            ),
        );
    }

    const mastLabel = sideLabel(mastScreen.x);
    parts.push(
        textElement(
            "plan-mast-label",
            mastLabel.x,
            mastScreen.y + 4,
            `Mast (${formatNumber(snapshot.placement.x)}, ${formatNumber(snapshot.placement.y)})`,
            mastLabel.anchor,
            "#111827",
            12,
        ),
    );

    NOTE_LINES.forEach((line, index) => {
        parts.push(
            textElement(
                "plan-note",
                TOWER_PLAN_VIEW_WIDTH / 2,
                TOWER_PLAN_VIEW_HEIGHT - 36 + index * 18,
                line,
                "middle",
                "#475569",
                11,
            ),
        );
    });

    parts.push("</svg>");
    return parts.join("");
}

/**
 * Build the S7 plan-view contribution for a snapshot. S7 accepts the encoded
 * SVG in `imageDataUrl`, so the markup is only ever displayed through an
 * `<img>` data URL. Returns `undefined` when required geometry is unavailable.
 */
export function buildTowerReportPlanView(snapshot: TowerReportSnapshot): ReportPlanView | undefined {
    const svg = renderTowerPlanViewSvg(snapshot);
    if (svg === undefined) return undefined;

    return {
        title: "Tower pick plan view",
        caption:
            "Mast, governing hook-radius rings and captured pick-up and set-down points. Schematic only; no swing path, jib orientation, clearance or site boundary is shown or verified.",
        scaleText: TOWER_PLAN_SCALE_TEXT,
        imageDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    };
}
