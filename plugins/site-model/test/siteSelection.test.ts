// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { Document } from "@chili3d/app";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import {
    clearSiteSource,
    hasSiteSource,
    readSiteSource,
    SITE_SOURCE_USER_DATA_KEY,
    writeSiteSource,
} from "../src/siteSelection";

const sampleDxf = readFileSync(
    path.resolve(import.meta.dirname, "../../../public/sample-site/sample-site.dxf"),
    "utf-8",
);

describe("site-model per-document site selection", () => {
    const validSelection = { kind: "dxfText" as const, name: "site.dxf", dxfText: "0\nSECTION" };

    test("a fresh document has no selected site", () => {
        const document = new TestDocument();

        expect(hasSiteSource(document)).toBe(false);
        expect(readSiteSource(document).isOk).toBe(false);
        expect(readSiteSource(document).error).toContain("No site model is selected");
    });

    test("write then read round-trips the selection through document.userData", () => {
        const document = new TestDocument();
        document.name = "Project A";

        const written = writeSiteSource(document, validSelection);
        expect(written.isOk).toBe(true);

        expect(hasSiteSource(document)).toBe(true);
        // Stored under the single namespaced key, like the AI package's chat history.
        expect(Object.keys(document.userData ?? {})).toEqual([SITE_SOURCE_USER_DATA_KEY]);

        const source = readSiteSource(document);
        expect(source.isOk).toBe(true);
        expect(source.value.kind).toBe("dxfText");
        expect(source.value.name).toBe("site.dxf");
        expect(source.value.dxfText).toBe(validSelection.dxfText);
    });

    test("writeSiteSource also initialises userData when it is undefined", () => {
        const document = new TestDocument();
        expect(document.userData).toBeUndefined();

        expect(writeSiteSource(document, validSelection).isOk).toBe(true);
        expect(document.userData).toBeDefined();
        expect(hasSiteSource(document)).toBe(true);
    });

    test("a write is rejected when the selection is malformed and leaves stored data untouched", () => {
        const document = new TestDocument();
        expect(writeSiteSource(document, validSelection).isOk).toBe(true);

        const before = document.userData?.[SITE_SOURCE_USER_DATA_KEY];

        const badName = writeSiteSource(document, { ...validSelection, name: "  " });
        expect(badName.isOk).toBe(false);
        expect(badName.error).toContain("name");

        const badText = writeSiteSource(document, { ...validSelection, dxfText: "" });
        expect(badText.isOk).toBe(false);
        expect(badText.error).toContain("DXF text");

        const badKind = writeSiteSource(document, { ...validSelection, kind: "fabricated" as never });
        expect(badKind.isOk).toBe(false);
        expect(badKind.error).toContain("kind");

        // The original selection was never overwritten by any rejected write.
        expect(document.userData?.[SITE_SOURCE_USER_DATA_KEY]).toEqual(before);
        expect(readSiteSource(document).value?.name).toBe("site.dxf");
    });

    test("reading validates a malformed stored value instead of returning site data", () => {
        const document = new TestDocument();
        document.userData = { [SITE_SOURCE_USER_DATA_KEY]: 42 };
        expect(hasSiteSource(document)).toBe(true);
        const numeric = readSiteSource(document);
        expect(numeric.isOk).toBe(false);
        expect(numeric.error).toContain("invalid");

        document.userData = { [SITE_SOURCE_USER_DATA_KEY]: { kind: "dxfText", name: "x" } };
        const noText = readSiteSource(document);
        expect(noText.isOk).toBe(false);
        expect(noText.error).toContain("DXF text");

        document.userData = { [SITE_SOURCE_USER_DATA_KEY]: null };
        const nulled = readSiteSource(document);
        expect(nulled.isOk).toBe(false);
    });

    test("clearSiteSource removes the selection so planners report UNAVAILABLE", () => {
        const document = new TestDocument();
        expect(writeSiteSource(document, validSelection).isOk).toBe(true);

        clearSiteSource(document);
        expect(hasSiteSource(document)).toBe(false);
        expect(readSiteSource(document).isOk).toBe(false);
    });

    test("two documents keep independent site selections", () => {
        const documentA = new TestDocument();
        const documentB = new TestDocument();
        documentA.name = "Project A";
        documentB.name = "Project B";

        expect(writeSiteSource(documentA, { ...validSelection, name: "site-a.dxf" }).isOk).toBe(true);
        expect(writeSiteSource(documentB, { ...validSelection, name: "site-b.dxf" }).isOk).toBe(true);

        expect(readSiteSource(documentA).value?.name).toBe("site-a.dxf");
        expect(readSiteSource(documentB).value?.name).toBe("site-b.dxf");

        clearSiteSource(documentA);
        expect(readSiteSource(documentA).isOk).toBe(false);
        expect(readSiteSource(documentB).value?.name).toBe("site-b.dxf");
    });
});

describe("site selection through document serialization", () => {
    // Same round-trip shape as packages/app/test/document.test.ts: serialize a
    // real Document, then rebuild it with Document.load.
    function createApplication() {
        const application = createMockApplication();
        const document = new Document(application, "Project A");
        return { application, document };
    }

    test("a selection written to userData survives save and reload", async () => {
        const { application, document } = createApplication();
        // Site A: the sample site plan the whole planner suite is hand-worked against.
        const written = writeSiteSource(document, {
            kind: "dxfText",
            name: "site-a.dxf",
            dxfText: sampleDxf,
        });
        expect(written.isOk).toBe(true);

        const saved = document.serialize();
        expect(saved.userData?.[SITE_SOURCE_USER_DATA_KEY]).toBeDefined();

        const loaded = await Document.load(application, saved);
        try {
            expect(loaded).not.toBeUndefined();

            // The reloaded project still has the same site selected, byte for byte.
            expect(hasSiteSource(loaded!)).toBe(true);
            const source = readSiteSource(loaded!);
            expect(source.isOk).toBe(true);
            expect(source.value.kind).toBe("dxfText");
            expect(source.value.name).toBe("site-a.dxf");
            expect(source.value.dxfText).toBe(sampleDxf);
        } finally {
            loaded?.dispose();
            document.dispose();
        }
    });

    test("a reloaded project without a selection stays safely unavailable", async () => {
        const { application, document } = createApplication();

        const loaded = await Document.load(application, document.serialize());
        try {
            expect(hasSiteSource(loaded!)).toBe(false);
            const source = readSiteSource(loaded!);
            expect(source.isOk).toBe(false);
            expect(source.error).toContain("No site model is selected");
        } finally {
            loaded?.dispose();
            document.dispose();
        }
    });

    test("a malformed stored selection survives the round trip only as an error, never as site data", async () => {
        const { application, document } = createApplication();
        // Simulate a corrupted or hand-edited project file: the key exists but
        // holds nothing a planner could legitimately plan against.
        document.userData = { [SITE_SOURCE_USER_DATA_KEY]: 42 };

        const loaded = await Document.load(application, document.serialize());
        try {
            expect(hasSiteSource(loaded!)).toBe(true);
            const source = readSiteSource(loaded!);
            expect(source.isOk).toBe(false);
            expect(source.error).toContain("invalid");
        } finally {
            loaded?.dispose();
            document.dispose();
        }
    });
});
