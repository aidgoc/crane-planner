// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { MCT85F5 } from "../src/catalogue";
import { MILLIMETRES_PER_METRE, metresToMillimetres } from "../src/units";

describe("metresToMillimetres", () => {
    test("converts the known 40 m building edge to 40,000 mm", () => {
        // 40 m × 1000 mm/m = 40,000 mm.
        expect(metresToMillimetres(40)).toBe(40_000);
    });

    test("uses an exact 1000 mm per metre factor", () => {
        expect(MILLIMETRES_PER_METRE).toBe(1000);
        expect(metresToMillimetres(53.1)).toBe(53_100);
    });

    test("converts zero without changing it", () => {
        expect(metresToMillimetres(0)).toBe(0);
    });

    test("converts the MCT 85 F5 working dimensions exactly once at the boundary", () => {
        // 52 m working jib × 1000 = 52,000 mm; 30 m default jib = 30,000 mm.
        expect(metresToMillimetres(MCT85F5.maxJibLengthM.value)).toBe(52_000);
        expect(metresToMillimetres(MCT85F5.defaultJibM.value)).toBe(30_000);
    });
});
