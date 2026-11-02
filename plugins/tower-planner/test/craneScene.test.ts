// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { EdgeMeshData } from "@chili3d/core";
import { createMockView } from "@chili3d/core/test-utils";
import { expect, rs, test } from "@rstest/core";
import {
    BASE_EXCLUSION_RADIUS_M,
    createDefaultCraneCatalogue,
    deriveCraneLayout,
} from "../src/model/cranePlacement";
import { CraneScene } from "../src/view/craneScene";

test("draws max, min, counter-jib and base rings with catalogue radii in millimetres", () => {
    // Hand-worked calculation:
    // Mast M = (30,40) m. Slew 0 deg points along +X.
    // Max ring starts at (30 + 40, 40) = (70,40) m = (70000,40000,10) mm.
    // Min ring starts at (30 + 16.2, 40) = (46.2,40) m = (46200,40000,10) mm.
    // Counter-jib ring starts at (30 + 15, 40) = (45,40) m = (45000,40000,10) mm.
    // Base-exclusion ring starts at (30 + 20, 40) = (50,40) m = (50000,40000,10) mm.
    const view = createMockView();
    let nextId = 1;
    const displaySpy = rs
        .spyOn(view.document.visual.context, "displayMesh")
        .mockImplementation(() => nextId++);
    const scene = new CraneScene(view);
    const layout = deriveCraneLayout(createDefaultCraneCatalogue(), { x: 30, y: 40, slewAngleDeg: 0 });

    scene.update(layout);

    expect(displaySpy).toHaveBeenCalledTimes(6);
    const rings = displaySpy.mock.calls.slice(0, 4).map(([datas]) => datas[0] as EdgeMeshData);
    expect(rings[0].color).toBe(0xe8590c);
    expect(rings[0].lineType).toBe("solid");
    expect(rings[0].lineWidth).toBe(2);
    expect(Array.from(rings[0].position.slice(0, 3))).toEqual([70000, 40000, 10]);
    expect(rings[1].color).toBe(0x2f9e44);
    expect(rings[1].lineType).toBe("dash");
    expect(Array.from(rings[1].position.slice(0, 3))).toEqual([46200, 40000, 10]);
    expect(rings[2].color).toBe(0x1c7ed6);
    expect(rings[2].lineType).toBe("dash");
    expect(Array.from(rings[2].position.slice(0, 3))).toEqual([45000, 40000, 10]);
    expect(rings[3].color).toBe(0x868e96);
    expect(rings[3].lineType).toBe("dash");
    expect(Array.from(rings[3].position.slice(0, 3))).toEqual([50000, 40000, 10]);
    expect(rings[3].position.length).toBe(180 * 6);
    expect(BASE_EXCLUSION_RADIUS_M).toBe(20);
});

test("moving the mast removes the old rings and draws new ones at the new centre", () => {
    // Hand-worked: mast moves from (0,0) to (10,10), max radius stays 40 m.
    // New max-ring start = (10 + 40, 10) = (50,10) m = (50000,10000,10) mm.
    const view = createMockView();
    let nextId = 1;
    const displaySpy = rs
        .spyOn(view.document.visual.context, "displayMesh")
        .mockImplementation(() => nextId++);
    const removeSpy = rs.spyOn(view.document.visual.context, "removeMesh");
    const scene = new CraneScene(view);
    const catalogue = createDefaultCraneCatalogue();

    scene.update(deriveCraneLayout(catalogue, { x: 0, y: 0, slewAngleDeg: 0 }));
    expect(removeSpy).not.toHaveBeenCalled();

    scene.update(deriveCraneLayout(catalogue, { x: 10, y: 10, slewAngleDeg: 0 }));

    expect(removeSpy.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 4, 5, 6]);
    const newMaxRing = displaySpy.mock.calls.at(-6)?.[0][0] as EdgeMeshData;
    expect(Array.from(newMaxRing.position.slice(0, 3))).toEqual([50000, 10000, 10]);
});
