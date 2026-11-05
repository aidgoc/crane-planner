// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("tower-planner PDF guard", () => {
    test("ignores the local source PDFs so they cannot be committed accidentally", () => {
        const ignoreRules = readFileSync(path.join(repoRoot, ".gitignore"), "utf8")
            .split(/\r?\n/)
            .map((line) => line.trim());

        expect(ignoreRules).toContain("plugins/tower-planner/docs/*.pdf");

        // `check-ignore` works even when the local PDFs are absent from a clean
        // checkout, so this guard is meaningful in CI as well as on a machine
        // that holds the source documents.
        expect(() =>
            execFileSync("git", ["check-ignore", "--quiet", "plugins/tower-planner/docs/example.pdf"], {
                cwd: repoRoot,
            }),
        ).not.toThrow();
    });

    test("does not track any PDF under the tower-planner plugin", () => {
        const tracked = execFileSync("git", ["ls-files", "--", "plugins/tower-planner"], {
            cwd: repoRoot,
            encoding: "utf8",
        });

        const trackedPdfs = tracked.split(/\r?\n/).filter((file) => file.toLowerCase().endsWith(".pdf"));

        expect(trackedPdfs).toEqual([]);
    });
});
