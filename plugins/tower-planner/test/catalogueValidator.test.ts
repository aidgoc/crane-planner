// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import rawCatalogue from "../data/crane-catalogue.json";
import {
    type CatalogueValidationIssue,
    type CatalogueValidationResult,
    validateCatalogue,
} from "../src/catalogueValidator";

type MutableCatalogue = {
    schemaVersion: number;
    // biome-ignore lint/suspicious/noExplicitAny: these tests deliberately corrupt arbitrary catalogue fields
    cranes: Array<Record<string, any>>;
};

function cloneCatalogue(): MutableCatalogue {
    return JSON.parse(JSON.stringify(rawCatalogue)) as MutableCatalogue;
}

function expectErrors(result: CatalogueValidationResult): CatalogueValidationIssue[] {
    if (result.ok) throw new Error("Expected catalogue validation to fail, but it passed.");
    return result.errors;
}

function findError(errors: readonly CatalogueValidationIssue[], pathPart: string) {
    return errors.find((error) => error.path.includes(pathPart));
}

describe("validateCatalogue", () => {
    test("accepts the shipped two-crane catalogue, including both INDICATIVE default jibs", () => {
        const result = validateCatalogue(cloneCatalogue());

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("Shipped catalogue should validate.");

        expect(result.catalogue.cranes.map((crane) => crane.id)).toEqual([
            "potain-mct-88",
            "potain-mct-85-f5",
        ]);

        const [mct88, mct85] = result.catalogue.cranes;
        expect(mct88.defaultJibM.provenance.kind).toBe("indicative");
        expect(mct88.maxCapacityT.provenance).toEqual({
            kind: "source",
            sourceId: "datasheetOverview",
        });

        // MCT 85 F5: 5 t maximum, 52 m maximum working jib, and 8 published
        // chart rows / 86 points from PDF p. 3.
        expect(mct85.defaultJibM.value).toBe(30);
        expect(mct85.defaultJibM.provenance.kind).toBe("indicative");
        expect(mct85.maxCapacityT.provenance).toEqual({
            kind: "source",
            sourceId: "datasheetOverview",
        });
        expect(mct85.loadChart).toHaveLength(8);
        expect(mct85.loadChart?.reduce((total, row) => total + row.points.length, 0)).toBe(86);
        expect(mct85.loadChart?.[0].jibM.value).toBe(20);
        expect(mct85.loadChart?.[0].minRadiusM).toEqual({
            value: 2.7,
            provenance: { kind: "source", sourceId: "datasheetLoadCharts" },
        });
        expect(mct85.loadChart?.every((row) => row.minRadiusM.value === 2.7)).toBe(true);
        expect(mct85.loadChart?.[0].points[0].capacityT).toEqual({
            value: 5,
            provenance: { kind: "source", sourceId: "datasheetLoadCharts" },
        });
    });

    test("rejects a numeric field with no provenance", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].maxCapacityT = { value: 5 };

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(findError(errors, "cranes[0].maxCapacityT")).toBeDefined();
        expect(errors.some((error) => error.message.includes("provenance"))).toBe(true);
    });

    test("rejects a bare number instead of a sourced/INDICATIVE wrapper", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].maxCapacityT = 5;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].maxCapacityT" &&
                    error.message.includes("not wrapped in a sourced/INDICATIVE value"),
            ),
        ).toBe(true);
    });

    test("rejects an unknown source id", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].maxCapacityT.provenance.sourceId = "missing-source";

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].maxCapacityT.provenance.sourceId" &&
                    error.message.includes("Unknown sourceId"),
            ),
        ).toBe(true);
    });

    test("rejects an unknown provenance kind", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].maxCapacityT.provenance = {
            kind: "manufacturer",
            sourceId: "datasheetOverview",
        };

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].maxCapacityT.provenance.kind" &&
                    error.message.includes('must be "source" or "indicative"'),
            ),
        ).toBe(true);
    });

    test("rejects a source provenance without a sourceId", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].maxCapacityT.provenance = { kind: "source" };

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].maxCapacityT.provenance.sourceId" &&
                    error.message.includes("must name a sourceId"),
            ),
        ).toBe(true);
    });

    test("rejects a non-object provenance", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].maxCapacityT.provenance = "datasheetOverview";

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].maxCapacityT.provenance" &&
                    error.message.includes("missing provenance"),
            ),
        ).toBe(true);
    });

    test("rejects a sourced number without a value", () => {
        const catalogue = cloneCatalogue();
        delete catalogue.cranes[0].maxCapacityT.value;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(findError(errors, "cranes[0].maxCapacityT")).toBeDefined();
    });

    test.each([
        "__proto__",
        "toString",
        "constructor",
    ])("rejects inherited property %s as a source id", (sourceId) => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].maxCapacityT.provenance.sourceId = sourceId;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(errors).toContainEqual({
            path: "cranes[0].maxCapacityT.provenance.sourceId",
            message: `Unknown sourceId "${sourceId}".`,
        });
    });

    test.each(["section", "url", "note"])("rejects a non-string optional source %s", (field) => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].sources.datasheetOverview[field] = 42;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(findError(errors, `cranes[0].sources.datasheetOverview.${field}`)).toBeDefined();
    });

    test("rejects a source entry that is not an object", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].sources.datasheetOverview = "page 1";

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(errors).toContainEqual({
            path: "cranes[0].sources.datasheetOverview",
            message: "Source metadata must be an object.",
        });
    });

    test("rejects a crane without a sources object", () => {
        const catalogue = cloneCatalogue();
        delete catalogue.cranes[0].sources;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(errors).toContainEqual({
            path: "cranes[0].sources",
            message: "Crane entries must declare a sources object.",
        });
    });

    test("rejects source metadata without a page", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].sources.datasheetOverview.page = 0;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(findError(errors, "cranes[0].sources.datasheetOverview.page")).toBeDefined();
    });

    test("rejects source metadata without a document name", () => {
        const catalogue = cloneCatalogue();
        delete catalogue.cranes[0].sources.datasheetDimensions.document;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(findError(errors, "cranes[0].sources.datasheetDimensions.document")).toBeDefined();
    });

    test("rejects an INDICATIVE provenance with no basis", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].defaultJibM.provenance = { kind: "indicative" };

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(findError(errors, "cranes[0].defaultJibM.provenance.basis")).toBeDefined();
    });

    test("rejects an empty tip-load table", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].tipLoadByJib = [];

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].tipLoadByJib" && error.message.includes("at least one row"),
            ),
        ).toBe(true);
    });

    test("rejects tip-load rows that are not in ascending jib-length order", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].tipLoadByJib[1].jibM.value = 19;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].tipLoadByJib[1].jibM.value" &&
                    error.message.includes("strictly ascending"),
            ),
        ).toBe(true);
    });

    test("rejects a tip-load table beyond the declared maximum jib", () => {
        const catalogue = cloneCatalogue();
        const rows = catalogue.cranes[0].tipLoadByJib;
        rows[rows.length - 1].jibM.value = 60;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].tipLoadByJib[7].jibM.value" &&
                    error.message.includes("cannot extend beyond"),
            ),
        ).toBe(true);
    });

    test("rejects a negative tip load", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].tipLoadByJib[0].tipT.value = -1;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].tipLoadByJib[0].tipT.value" &&
                    error.message.includes("greater than zero"),
            ),
        ).toBe(true);
    });

    test("rejects a tip load that increases as the jib gets longer", () => {
        // 25 m row raised above the 20 m row's 3.95 t. A longer jib cannot carry
        // more at its tip; this is a malformed sequence, not a rounding effect.
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].tipLoadByJib[1].tipT.value = 4.0;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].tipLoadByJib[1].tipT.value" &&
                    error.message.includes("must not increase"),
            ),
        ).toBe(true);
    });

    test("allows equal adjacent tip loads but rejects an increase beyond floating-point noise", () => {
        // Equal tip loads are physically plausible (a flat plateau), so `>` is
        // the rule. The tolerance is 1e-9 t: 1e-10 above the previous value is
        // floating-point noise, while 1e-6 t is a real increase.
        const equal = cloneCatalogue();
        equal.cranes[0].tipLoadByJib[1].tipT.value = 3.95;
        expect(validateCatalogue(equal).ok).toBe(true);

        const withinNoise = cloneCatalogue();
        withinNoise.cranes[0].tipLoadByJib[1].tipT.value = 3.95 + 1e-10;
        expect(validateCatalogue(withinNoise).ok).toBe(true);

        const realIncrease = cloneCatalogue();
        realIncrease.cranes[0].tipLoadByJib[1].tipT.value = 3.95 + 1e-6;
        expect(
            expectErrors(validateCatalogue(realIncrease)).some((error) =>
                error.message.includes("must not increase"),
            ),
        ).toBe(true);
    });

    test.each(["id", "name", "standard"])("rejects a crane without %s", (field) => {
        const catalogue = cloneCatalogue();
        delete catalogue.cranes[0][field];

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(errors.some((error) => error.path === `cranes[0].${field}`)).toBe(true);
    });

    test.each([
        { field: "maxCapacityT", label: "maximum capacity" },
        { field: "maxJibLengthM", label: "maximum jib length" },
        { field: "defaultJibM", label: "default jib length" },
    ])("rejects a non-positive $label", ({ field }) => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0][field].value = 0;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === `cranes[0].${field}.value` && error.message.includes("greater than zero"),
            ),
        ).toBe(true);
    });

    test("rejects a default jib longer than the maximum jib", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].defaultJibM.value = 60;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].defaultJibM.value" && error.message.includes("cannot exceed"),
            ),
        ).toBe(true);
    });

    test.each(["dimensions", "heaviestErectionComponent"])("rejects a crane without %s", (field) => {
        const catalogue = cloneCatalogue();
        delete catalogue.cranes[0][field];

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(errors.some((error) => error.path === `cranes[0].${field}`)).toBe(true);
    });

    test.each(["mastWidthM", "counterJibLengthM"])("rejects a non-positive %s", (field) => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].dimensions[field].value = 0;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === `cranes[0].dimensions.${field}.value` &&
                    error.message.includes("greater than zero"),
            ),
        ).toBe(true);
    });

    test("rejects a non-positive heaviest component mass", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].heaviestErectionComponent.massT.value = 0;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].heaviestErectionComponent.massT.value" &&
                    error.message.includes("greater than zero"),
            ),
        ).toBe(true);
    });

    test("rejects a heaviest component without a name", () => {
        const catalogue = cloneCatalogue();
        delete catalogue.cranes[0].heaviestErectionComponent.name;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(findError(errors, "cranes[0].heaviestErectionComponent.name")).toBeDefined();
    });

    test("rejects a tip-load row that is not an object", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].tipLoadByJib[0] = null;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(errors).toContainEqual({
            path: "cranes[0].tipLoadByJib[0]",
            message: "Tip-load row must be an object.",
        });
    });

    test("rejects a non-positive tip-load jib length", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].tipLoadByJib[0].jibM.value = 0;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].tipLoadByJib[0].jibM.value" &&
                    error.message.includes("greater than zero"),
            ),
        ).toBe(true);
    });

    test.each([
        { field: "jibM", value: Number.NaN },
        { field: "tipT", value: Number.POSITIVE_INFINITY },
    ])("rejects a non-finite $field value", ({ field, value }) => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].tipLoadByJib[0][field].value = value;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === `cranes[0].tipLoadByJib[0].${field}` &&
                    error.message.includes("missing or malformed"),
            ),
        ).toBe(true);
    });

    test("rejects a bare number nested in crane data", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[0].dimensions.mastWidthM = 1.2;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[0].dimensions.mastWidthM" &&
                    error.message.includes("not wrapped in a sourced/INDICATIVE value"),
            ),
        ).toBe(true);
    });

    test("rejects a chart-based crane with an empty load chart", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart = [];

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart" && error.message.includes("at least one jib row"),
            ),
        ).toBe(true);
    });

    test("rejects a load-chart row with no radius points", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].points = [];

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].points" &&
                    error.message.includes("at least one radius point"),
            ),
        ).toBe(true);
    });

    test("rejects a load-chart row that is not an object", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0] = null;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(errors).toContainEqual({
            path: "cranes[1].loadChart[0]",
            message: "Load-chart jib row must be an object.",
        });
    });

    test("rejects a load-chart row without a minimum radius", () => {
        const catalogue = cloneCatalogue();
        delete catalogue.cranes[1].loadChart[0].minRadiusM;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].minRadiusM" &&
                    error.message.includes("missing or malformed"),
            ),
        ).toBe(true);
    });

    test("rejects a non-positive load-chart minimum radius", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].minRadiusM.value = 0;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].minRadiusM.value" &&
                    error.message.includes("greater than zero"),
            ),
        ).toBe(true);
    });

    test("rejects a minimum radius beyond the jib length", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].minRadiusM.value = 21;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].minRadiusM.value" &&
                    error.message.includes("cannot exceed its jib length"),
            ),
        ).toBe(true);
    });

    test("rejects a first chart radius below the declared minimum radius", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].minRadiusM.value = 17;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].points[0].radiusM.value" &&
                    error.message.includes("below the declared minimum radius"),
            ),
        ).toBe(true);
    });

    test("rejects a load-chart point that is not an object", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].points[0] = null;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(errors).toContainEqual({
            path: "cranes[1].loadChart[0].points[0]",
            message: "Load-chart point must be an object.",
        });
    });

    test("rejects a load-chart jib that has no matching tip-load row", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].jibM.value = 21;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].jibM.value" &&
                    error.message.includes("must match a tip-load table row"),
            ),
        ).toBe(true);
    });

    test("rejects a load-chart jib beyond the declared maximum jib", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[7].jibM.value = 60;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[7].jibM.value" &&
                    error.message.includes("cannot exceed the declared maximum jib length"),
            ),
        ).toBe(true);
    });

    test("rejects load-chart radii that are not strictly ascending", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].points[1].radiusM.value = 16.3;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].points[1].radiusM.value" &&
                    error.message.includes("strictly ascending"),
            ),
        ).toBe(true);
    });

    test("rejects a load-chart radius beyond its jib length", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].points[2].radiusM.value = 21;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].points[2].radiusM.value" &&
                    error.message.includes("cannot exceed its jib length"),
            ),
        ).toBe(true);
    });

    test("rejects a load-chart capacity above the crane maximum", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].points[0].capacityT.value = 6;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].points[0].capacityT.value" &&
                    error.message.includes("cannot exceed the declared maximum capacity"),
            ),
        ).toBe(true);
    });

    test("rejects a load-chart capacity that increases with radius", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].loadChart[0].points[2].capacityT.value = 4.9;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].points[2].capacityT.value" &&
                    error.message.includes("must not increase with radius"),
            ),
        ).toBe(true);
    });

    test("rejects a load-chart point without provenance", () => {
        const catalogue = cloneCatalogue();
        delete catalogue.cranes[1].loadChart[0].points[0].capacityT.provenance;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].loadChart[0].points[0].capacityT" &&
                    error.message.includes("missing provenance"),
            ),
        ).toBe(true);
    });

    test("rejects a default jib that is not a published load-chart configuration", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes[1].defaultJibM.value = 32.5;

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) =>
                    error.path === "cranes[1].defaultJibM.value" &&
                    error.message.includes("published load-chart configurations"),
            ),
        ).toBe(true);
    });

    test("rejects duplicate crane ids", () => {
        const catalogue = cloneCatalogue();
        catalogue.cranes.push(JSON.parse(JSON.stringify(catalogue.cranes[0])));

        const errors = expectErrors(validateCatalogue(catalogue));

        expect(
            errors.some(
                (error) => error.path === "cranes[2].id" && error.message.includes("Duplicate crane id"),
            ),
        ).toBe(true);
    });

    test("rejects a malformed top-level document", () => {
        expect(validateCatalogue(null).ok).toBe(false);
        expect(validateCatalogue({}).ok).toBe(false);

        const wrongVersion = cloneCatalogue();
        wrongVersion.schemaVersion = 2;
        const errors = expectErrors(validateCatalogue(wrongVersion));
        expect(findError(errors, "schemaVersion")).toBeDefined();
    });
});
