// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// ============================================================================
// Planning aid, not a certified lift plan.
// Tests for the M6/M7 panel section (3D boom clearance and swing sweep)
// Owner: Abhishek
//
// Expected distances are worked out by hand, not read back from the code:
// a horizontal boom along +X at height 2.5 m with radius 0.5 m, slew 0,
// at centre (20, 5): its pivot is at (20.8, 5, 2.5), so the boom spans x = 20.8 to 40.8
// and y = 4.5 to 5.5. Tower A (x 25 to 65, y 20 to 42, 75 m high) has its south face at
// y = 20, so the distance is 20 - 5.5 = 14.5 m. The Podium south face is at y = 12
// (9 m high, boom height 2 to 3 m is inside it): 12 - 5.5 = 6.5 m.
// The power line wall at x = -9 is 20.8 - (-9) = 29.8 m from the boom foot.
// ============================================================================

import { type IShapeFactory, PubSub, type PubSubEventMap } from "@chili3d/core";
import { createMockView } from "@chili3d/core/test-utils";
import { ShapeFactory } from "@chili3d/wasm";
import { expect, test } from "@rstest/core";
import { computeSiteClearance } from "../src/clearance/siteClearance";
import { betweenSamplesAllowanceM, sweepSlew } from "../src/clearance/swingSweep";
import { KIT } from "../src/modules/craneModel";
import type { SiteObstacle } from "../src/modules/placementState";
import { SAMPLE_SITE_OBSTACLES } from "../src/modules/sampleSiteObstacles";
import {
    BOOM_PIVOT_HEIGHT_M,
    BOOM_RADIUS_M,
    type Clearance3DInput,
    Clearance3DSection,
    splitObstacles,
    toBoomPlacement,
    toSweepPlacement,
} from "../src/ui/clearance3dSection";
import { MobileCranePlacementPanel } from "../src/ui/mobilePlacementPanel";
import "./setup";

const TOWER_A_ONLY: SiteObstacle[] = [SAMPLE_SITE_OBSTACLES[0]];

const CASE_A: Clearance3DInput = {
    craneCentreXM: 20,
    craneCentreYM: 5,
    slewAngleDeg: 0,
    boomLengthM: 20,
    boomAngleDeg: 0,
};

function makeSection(factory: IShapeFactory | undefined): Clearance3DSection {
    return new Clearance3DSection(() => factory, { debounceMs: 0 });
}

/** Status badges shown now (exact text of a badge, so a message that says "not SAFE" does not count). */
function badges(section: Clearance3DSection): string[] {
    return Array.from(section.el.querySelectorAll("span"))
        .map((e) => e.textContent ?? "")
        .filter((t) => t === "SAFE" || t === "WARNING" || t === "CRITICAL" || t === "NOT CHECKED");
}

function text(section: Clearance3DSection): string {
    return section.el.textContent ?? "";
}

/** The M6 number shown for one obstacle: the value that follows its label. */
function distanceOf(section: Clearance3DSection, label: string): number {
    const rows = Array.from(section.el.querySelectorAll("div")).filter(
        (d) => d.children.length === 2 && d.firstElementChild?.textContent === label,
    );
    expect(rows.length).toBeGreaterThan(0);
    const m = /(-?[\d.]+) m/.exec(rows[0].children[1].textContent ?? "");
    expect(m).not.toBeNull();
    return Number.parseFloat((m as RegExpExecArray)[1]);
}

test("toBoomPlacement uses the foot 0.8 m along the slew, at the marker's deck height and radius", () => {
    const b = toBoomPlacement({ ...CASE_A, slewAngleDeg: 90 });
    expect(b.pivotM.x).toBeCloseTo(20, 9);
    expect(b.pivotM.y).toBeCloseTo(5.8, 9);
    expect(b.pivotM.z).toBe(BOOM_PIVOT_HEIGHT_M);
    expect(b.boomRadiusM).toBe(BOOM_RADIUS_M);
    expect(b.boomLengthM).toBe(20);
    expect(b.elevationDeg).toBe(0);
});

test("splitObstacles: sample site gives 6 buildings with heights and 1 power line, none skipped", () => {
    const s = splitObstacles(SAMPLE_SITE_OBSTACLES);
    expect(s.buildings.length).toBe(6);
    expect(s.powerLine?.x_m).toBe(-9);
    expect(s.powerLine?.clearanceLimitM).toBe(6);
    expect(s.skipped).toEqual([]);
});

test("splitObstacles: an obstacle with no polygon height is skipped and listed, a second power line too", () => {
    const s = splitObstacles([
        {
            label: "no height",
            requiredClearanceM: 1,
            polygon: [
                [0, 0],
                [1, 0],
                [1, 1],
            ],
        },
        { label: "wire 1", requiredClearanceM: 6, xLineM: -9 },
        { label: "wire 2", requiredClearanceM: 6, xLineM: 90 },
        { label: "point", requiredClearanceM: 1, xM: 3, yM: 4 },
    ]);
    expect(s.buildings.length).toBe(0);
    expect(s.powerLine?.label).toBe("wire 1");
    expect(s.skipped).toEqual(["no height", "wire 2", "point"]);
});

test("M6 in the panel section matches the hand-worked distances (Tower A 14.5 m, Podium 6.5 m, power line 29.8 m)", () => {
    const section = makeSection(new ShapeFactory());
    section.update(CASE_A, SAMPLE_SITE_OBSTACLES);
    expect(distanceOf(section, "Tower A (G+24, 75 m)")).toBeCloseTo(14.5, 2);
    expect(distanceOf(section, "Podium (9 m)")).toBeCloseTo(6.5, 2);
    expect(distanceOf(section, "22 kV Power Line (x = -9 m)")).toBeCloseTo(29.8, 2);
    expect(text(section)).toContain("Minimum distance");
    expect(text(section)).toContain("Podium (9 m)");
    section.dispose();
});

test("M6 shows WARNING (red) inside the limit and CRITICAL on collision", () => {
    const factory = new ShapeFactory();
    // Boom at y 18.6: top at 19.1, Tower A face at 20, so 0.9 m, limit 2 m.
    const warn = makeSection(factory);
    warn.update({ ...CASE_A, craneCentreYM: 18.6 }, TOWER_A_ONLY);
    expect(distanceOf(warn, "Tower A (G+24, 75 m)")).toBeCloseTo(0.9, 2);
    expect(badges(warn)).toContain("WARNING");
    expect(badges(warn)).not.toContain("SAFE");
    // Boom at y 21 passes through Tower A (x 25 to 65, y 20 to 42).
    const crit = makeSection(factory);
    crit.update({ ...CASE_A, craneCentreYM: 21 }, TOWER_A_ONLY);
    expect(text(crit)).toContain("COLLISION");
    expect(badges(crit)).toContain("CRITICAL");
});

test("M6 is NOT CHECKED, never SAFE, when the 3D kernel is missing", () => {
    const section = makeSection(undefined);
    section.update(CASE_A, SAMPLE_SITE_OBSTACLES);
    expect(text(section)).toContain("NOT CHECKED");
    expect(badges(section)).not.toContain("SAFE");
});

test("M6 and M7 say 'No obstacles loaded' and are not SAFE when the site has no obstacles", () => {
    const section = makeSection(new ShapeFactory());
    section.update(CASE_A, []);
    expect(text(section)).toContain("No obstacles loaded");
    section.runSweep();
    expect(badges(section)).not.toContain("SAFE");
    expect(
        Array.from(section.el.querySelectorAll("div")).filter((d) =>
            /No obstacles loaded/.test(d.textContent ?? ""),
        ).length,
    ).toBeGreaterThan(1);
});

test("M7 sweep from the panel section reports the same worst distance and angle as sweepSlew, 46 angles", () => {
    const factory = new ShapeFactory();
    const input: Clearance3DInput = {
        craneCentreXM: 0,
        craneCentreYM: 0,
        slewAngleDeg: 0,
        boomLengthM: 30,
        boomAngleDeg: 40,
    };
    const section = makeSection(factory);
    section.update(input, SAMPLE_SITE_OBSTACLES);
    section.runSweep();
    const direct = sweepSlew(
        factory,
        toSweepPlacement(input),
        0,
        90,
        2,
        splitObstacles(SAMPLE_SITE_OBSTACLES).buildings,
        splitObstacles(SAMPLE_SITE_OBSTACLES).powerLine,
        KIT.PIVOT_OFFSET_M,
    );
    const w = direct.worstStep;
    expect(w).not.toBeNull();
    expect(direct.sampleCount).toBe(46);
    expect(text(section)).toContain("46 angles from 0° to 90°, step 2°");
    expect(text(section)).toContain("Worst distance");
    expect(text(section)).toContain(`${(w as NonNullable<typeof w>).slewDeg}°`);
    expect(text(section)).toContain((w as NonNullable<typeof w>).result.obstacleLabel);
    expect(text(section)).toContain("Whole swing");
});

test("M7: changing the step from 2 to 5 degrees moves the worst distance by less than 10 cm (BACKLOG M7)", () => {
    const factory = new ShapeFactory();
    const input: Clearance3DInput = {
        craneCentreXM: 0,
        craneCentreYM: 0,
        slewAngleDeg: 0,
        boomLengthM: 30,
        boomAngleDeg: 40,
    };
    const split = splitObstacles(SAMPLE_SITE_OBSTACLES);
    const worst = (step: number) =>
        (
            sweepSlew(
                factory,
                toSweepPlacement(input),
                0,
                90,
                step,
                split.buildings,
                split.powerLine,
                KIT.PIVOT_OFFSET_M,
            ).worstStep as {
                result: { minDistanceM: number };
            }
        ).result.minDistanceM;
    const fine = worst(0.25);
    expect(Math.abs(worst(2) - fine)).toBeLessThan(0.1);
    expect(Math.abs(worst(5) - fine)).toBeLessThan(0.1);
});

test("M7 shows the error and does not throw when the step is not valid", () => {
    const section = makeSection(new ShapeFactory());
    section.update(CASE_A, SAMPLE_SITE_OBSTACLES);
    const inputs = section.el.querySelectorAll("input");
    (inputs[2] as HTMLInputElement).value = "0";
    expect(() => section.runSweep()).not.toThrow();
    expect(text(section)).toContain("Cannot run sweep");
    expect(text(section)).toContain("stepDeg must be > 0");
});

test("a new position clears the old sweep result (it would be stale)", () => {
    const section = makeSection(new ShapeFactory());
    section.update(CASE_A, SAMPLE_SITE_OBSTACLES);
    section.runSweep();
    expect(text(section)).toContain("Worst distance");
    section.update({ ...CASE_A, craneCentreXM: 21 }, SAMPLE_SITE_OBSTACLES);
    expect(text(section)).not.toContain("Worst distance");
    expect(text(section)).toContain("Press “Run swing sweep” again");
});

test("invalid panel input clears both results", () => {
    const section = makeSection(new ShapeFactory());
    section.update(CASE_A, SAMPLE_SITE_OBSTACLES);
    section.clear();
    expect(text(section)).not.toContain("Minimum distance");
    expect(text(section)).not.toContain("Worst distance");
});

test("the section says that the 3D results are not part of the Overall verdict", () => {
    const section = makeSection(undefined);
    expect(text(section)).toContain("not part of the Overall verdict");
});

test("two obstacles with the same label each show their own distance (rows are matched by id)", () => {
    const tower = SAMPLE_SITE_OBSTACLES[0];
    const podium = SAMPLE_SITE_OBSTACLES.find((o) => o.label.startsWith("Podium"));
    expect(podium).toBeDefined();
    const section = makeSection(new ShapeFactory());
    section.update(CASE_A, [
        { ...tower, label: "Same label" },
        { ...(podium as SiteObstacle), label: "Same label" },
    ]);
    const rows = Array.from(section.el.querySelectorAll("div")).filter(
        (d) => d.children.length === 2 && d.firstElementChild?.textContent === "Same label",
    );
    const metres = rows.map((r) => /(-?[\d.]+) m/.exec(r.children[1].textContent ?? "")?.[1]).map(Number);
    expect(metres.length).toBe(2);
    // Hand values (see the header): Tower A 14.5 m, Podium 6.5 m, in the order of the site.
    expect(metres[0]).toBeCloseTo(14.5, 1);
    expect(metres[1]).toBeCloseTo(6.5, 1);
});

test("the placement panel contains the M6/M7 section and fills it from the sample site", async () => {
    const factory = new ShapeFactory();
    const original = Object.getOwnPropertyDescriptor(globalThis, "shapeFactory");
    Object.defineProperty(globalThis, "shapeFactory", { configurable: true, get: () => factory });
    let content: HTMLElement | undefined;
    const handler: PubSubEventMap["showFloatPanel"] = (o) => {
        content = o.content;
    };
    PubSub.default.sub("showFloatPanel", handler);
    try {
        const panel = new MobileCranePlacementPanel(createMockView());
        panel.show();
        expect(content).toBeDefined();
        const html = content?.textContent ?? "";
        expect(html).toContain("3D Boom Clearance (M6)");
        expect(html).toContain("Swing Sweep (M7)");
        // Default placement: the 3D section is filled after its short wait.
        await new Promise((r) => setTimeout(r, 400));
        expect(content?.textContent).toContain("Minimum distance");
        expect(content?.textContent).toContain("Tower A (G+24, 75 m)");
        panel.dispose();
    } finally {
        PubSub.default.remove("showFloatPanel", handler);
        if (original) Object.defineProperty(globalThis, "shapeFactory", original);
        else Reflect.deleteProperty(globalThis, "shapeFactory");
    }
});

test("every sweep step gives the same distance as the M6 check of the real boom at that slew; at slew 90 the power line is 8.5 m away (hand value)", () => {
    const factory = new ShapeFactory();
    const input: Clearance3DInput = {
        craneCentreXM: 0,
        craneCentreYM: 0,
        slewAngleDeg: 0,
        boomLengthM: 38,
        boomAngleDeg: 60,
    };
    const split = splitObstacles(SAMPLE_SITE_OBSTACLES);
    const sweep = sweepSlew(
        factory,
        toSweepPlacement(input),
        0,
        90,
        15,
        split.buildings,
        split.powerLine,
        KIT.PIVOT_OFFSET_M,
    );
    for (const step of sweep.steps) {
        const m6 = computeSiteClearance(
            factory,
            toBoomPlacement({ ...input, slewAngleDeg: step.slewDeg }),
            split.buildings,
            split.powerLine,
        );
        for (const o of step.report.obstacles) {
            const same = m6.obstacles.find((x) => x.obstacleId === o.obstacleId);
            expect(o.minDistanceM).toBeCloseTo((same as NonNullable<typeof same>).minDistanceM, 6);
        }
    }
    // At slew 90 the boom axis is at x = 0 with radius 0.5 m: 9 - 0.5 = 8.5 m to the wall at x = -9.
    const last = sweep.steps[sweep.steps.length - 1];
    expect(last.slewDeg).toBe(90);
    const wire = last.report.obstacles.find((o) => o.obstacleLabel.includes("Power Line"));
    expect(wire?.minDistanceM).toBeCloseTo(8.5, 3);
    // At slew 0 the foot is at x = 0.8 and the boom is tilted back: 9.367 m, as M6 shows for the default.
    const first = sweep.steps[0].report.obstacles.find((o) => o.obstacleLabel.includes("Power Line"));
    expect(first?.minDistanceM).toBeCloseTo(9.367, 3);
});

test("sweepSlew rejects a negative or non-finite foot offset", () => {
    const factory = new ShapeFactory();
    const input: Clearance3DInput = { ...CASE_A, boomLengthM: 20 };
    const split = splitObstacles(SAMPLE_SITE_OBSTACLES);
    for (const bad of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() =>
            sweepSlew(factory, toSweepPlacement(input), 0, 10, 5, split.buildings, split.powerLine, bad),
        ).toThrow(RangeError);
    }
});

test("a foot offset makes the between-samples allowance larger, never smaller", () => {
    const input: Clearance3DInput = { ...CASE_A, boomLengthM: 20 };
    const b = toSweepPlacement(input);
    expect(betweenSamplesAllowanceM(b, 4, KIT.PIVOT_OFFSET_M)).toBeGreaterThan(
        betweenSamplesAllowanceM(b, 4),
    );
});
