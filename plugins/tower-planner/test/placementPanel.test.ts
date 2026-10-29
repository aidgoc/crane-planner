// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IView, PubSub } from "@chili3d/core";
import { createMockView } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";
import { TowerCranePlacementPanel } from "../src/ui/placementPanel";

afterEach(() => {
    rs.restoreAllMocks();
});

test("repeated show attaches view and document listeners once, and dispose releases them once", () => {
    const dom = document.createElement("div");
    const view = createMockView({ dom } as Partial<IView>);
    const subSpy = rs.spyOn(PubSub.default, "sub");
    const removeSpy = rs.spyOn(PubSub.default, "remove");
    const addSpy = rs.spyOn(dom, "addEventListener");
    const onDispose = rs.fn();
    const panel = new TowerCranePlacementPanel(view);
    panel.onDispose(onDispose);

    panel.show();
    panel.show();

    expect(subSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls.filter(([type]) => type === "pointerdown")).toHaveLength(1);

    panel.dispose();
    panel.dispose();

    expect(removeSpy).toHaveBeenCalledWith("documentClosed", expect.any(Function));
    expect(onDispose).toHaveBeenCalledTimes(1);
});
