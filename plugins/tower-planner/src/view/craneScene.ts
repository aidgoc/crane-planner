// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { EdgeMeshData, IView, LineType } from "@chili3d/core";
import type { Point2D } from "../geometry";
import { type CraneLayout, metresToMillimetres, sampleCircle } from "../model/cranePlacement";

const PLAN_Z_MM = 10;
const MARKER_HALF_SIZE_M = 2.5;
const RING_SEGMENTS = 180;

const COLORS = {
    minHookRadius: 0x2f9e44,
    maxHookRadius: 0xe8590c,
    counterJib: 0x1c7ed6,
    baseExclusion: 0x868e96,
    mast: 0x212529,
} as const;

type Segment = readonly [Point2D, Point2D];

export class CraneScene {
    private readonly ids: number[] = [];

    constructor(private readonly view: IView) {}

    update(layout: CraneLayout) {
        this.clear(false);

        this.ids.push(
            this.drawCircle(
                layout.rings.maxHookRadius.center,
                layout.rings.maxHookRadius.radius,
                COLORS.maxHookRadius,
                "solid",
                2,
            ),
        );
        this.ids.push(
            this.drawCircle(
                layout.rings.minHookRadius.center,
                layout.rings.minHookRadius.radius,
                COLORS.minHookRadius,
                "dash",
                1.5,
            ),
        );
        this.ids.push(
            this.drawCircle(
                layout.rings.counterJibSweep.center,
                layout.rings.counterJibSweep.radius,
                COLORS.counterJib,
                "dash",
                1.5,
            ),
        );
        this.ids.push(
            this.drawCircle(
                layout.rings.baseExclusion.center,
                layout.rings.baseExclusion.radius,
                COLORS.baseExclusion,
                "dash",
                1.5,
            ),
        );

        this.ids.push(
            this.drawSegments(
                [
                    [layout.mast, layout.jibTip],
                    [layout.mast, layout.counterJibTip],
                ],
                COLORS.mast,
                "solid",
                2,
            ),
        );

        this.ids.push(this.drawSegments(this.markerSegments(layout.mast), COLORS.mast, "solid", 2));
        this.view.update();
    }

    dispose(update = true) {
        this.clear(update);
    }

    private markerSegments(center: Point2D): Segment[] {
        const minX = center.x - MARKER_HALF_SIZE_M;
        const maxX = center.x + MARKER_HALF_SIZE_M;
        const minY = center.y - MARKER_HALF_SIZE_M;
        const maxY = center.y + MARKER_HALF_SIZE_M;

        return [
            [
                { x: minX, y: minY },
                { x: maxX, y: minY },
            ],
            [
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
            ],
            [
                { x: maxX, y: maxY },
                { x: minX, y: maxY },
            ],
            [
                { x: minX, y: maxY },
                { x: minX, y: minY },
            ],
            [
                { x: minX, y: minY },
                { x: maxX, y: maxY },
            ],
            [
                { x: maxX, y: minY },
                { x: minX, y: maxY },
            ],
        ];
    }

    private drawCircle(
        center: Point2D,
        radius: number,
        color: number,
        lineType: LineType,
        lineWidth: number,
    ) {
        const points = sampleCircle(center, radius, RING_SEGMENTS);
        const segments: Segment[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            segments.push([points[i], points[i + 1]]);
        }
        return this.drawSegments(segments, color, lineType, lineWidth);
    }

    private drawSegments(segments: Segment[], color: number, lineType: LineType, lineWidth: number) {
        const positions = new Float32Array(segments.length * 6);
        segments.forEach(([start, end], index) => {
            const offset = index * 6;
            positions[offset] = metresToMillimetres(start.x);
            positions[offset + 1] = metresToMillimetres(start.y);
            positions[offset + 2] = PLAN_Z_MM;
            positions[offset + 3] = metresToMillimetres(end.x);
            positions[offset + 4] = metresToMillimetres(end.y);
            positions[offset + 5] = PLAN_Z_MM;
        });

        const data: EdgeMeshData = {
            position: positions,
            range: [],
            color,
            lineType,
            lineWidth,
        };
        return this.view.document.visual.context.displayMesh([data], { onTop: true });
    }

    private clear(update = true) {
        const context = this.view.document.visual.context;
        for (const id of this.ids) {
            context.removeMesh(id);
        }
        this.ids.length = 0;
        if (update) {
            this.view.update();
        }
    }
}
