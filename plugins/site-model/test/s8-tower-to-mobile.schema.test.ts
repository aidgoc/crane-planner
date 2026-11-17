// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@rstest/core";

/*
 * The repository does not currently include a runtime JSON Schema validator
 * (no ajv/jsonschema dependency). To keep this PR dependency-free, this test
 * file contains a focused Draft 2020-12 evaluator for the exact keywords used
 * by the S8 schema. It loads the real schema and example from disk; it is
 * test-only and is not used by application code.
 */

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
interface JsonObject {
    [key: string]: JsonValue | undefined;
    $ref?: JsonValue;
    $schema?: JsonValue;
    additionalProperties?: JsonValue;
    allOf?: JsonValue;
    anyOf?: JsonValue;
    const?: JsonValue;
    description?: JsonValue;
    else?: JsonValue;
    enum?: JsonValue;
    exclusiveMinimum?: JsonValue;
    format?: JsonValue;
    if?: JsonValue;
    items?: JsonValue;
    minItems?: JsonValue;
    minLength?: JsonValue;
    minimum?: JsonValue;
    not?: JsonValue;
    properties?: JsonValue;
    required?: JsonValue;
    then?: JsonValue;
    type?: JsonValue;
}

interface ValidationError {
    readonly keyword: string;
    readonly path: string;
    readonly message: string;
}

const schemaPath = path.resolve(import.meta.dirname, "../schema/s8-tower-to-mobile.schema.json");
const examplePath = path.resolve(import.meta.dirname, "../schema/examples/s8-tower-to-mobile.example.json");

const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as JsonObject;
const canonicalExample = JSON.parse(readFileSync(examplePath, "utf-8")) as JsonObject;

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: JsonValue | undefined): JsonObject {
    if (!isObject(value)) {
        throw new Error("Expected an object in the S8 test fixture");
    }
    return value;
}

function asArray(value: JsonValue | undefined): JsonValue[] {
    if (!Array.isArray(value)) {
        throw new Error("Expected an array in the S8 test fixture");
    }
    return value;
}

function cloneExample(): JsonObject {
    return JSON.parse(JSON.stringify(canonicalExample)) as JsonObject;
}

function remove(object: JsonObject, key: string): void {
    Reflect.deleteProperty(object, key);
}

function set(object: JsonObject, key: string, value: JsonValue): void {
    object[key] = value;
}

function lift(doc: JsonObject): JsonObject {
    return asObject(asArray(doc["lifts"])[0]);
}

function component(doc: JsonObject): JsonObject {
    return asObject(lift(doc)["component"]);
}

function massSource(doc: JsonObject): JsonObject {
    return asObject(component(doc)["mass_source"]);
}

function schemaAt(root: JsonObject, keys: readonly string[]): JsonValue {
    let current: JsonValue = root;
    for (const key of keys) {
        if (!isObject(current)) {
            throw new Error(`Missing schema path: ${keys.join(".")}`);
        }
        const next: JsonValue | undefined = current[key];
        if (next === undefined) {
            throw new Error(`Missing schema path: ${keys.join(".")}`);
        }
        current = next;
    }
    return current;
}

function stringEnumAt(root: JsonObject, keys: readonly string[]): string[] {
    const value = schemaAt(root, keys);
    if (!Array.isArray(value)) {
        throw new Error(`Expected an enum array at: ${keys.join(".")}`);
    }
    return value.filter((item): item is string => typeof item === "string");
}

function descriptionAt(root: JsonObject, keys: readonly string[]): string {
    const value = schemaAt(root, keys);
    if (!isObject(value) || typeof value.description !== "string") {
        throw new Error(`Expected a description at: ${keys.join(".")}`);
    }
    return value.description;
}

function jsonEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]));
    }
    if (isObject(a) && isObject(b)) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        return aKeys.length === bKeys.length && aKeys.every((key) => key in b && jsonEqual(a[key], b[key]));
    }
    return false;
}

function matchesType(value: unknown, type: string): boolean {
    switch (type) {
        case "null":
            return value === null;
        case "boolean":
            return typeof value === "boolean";
        case "object":
            return isObject(value);
        case "array":
            return Array.isArray(value);
        case "number":
            return typeof value === "number" && Number.isFinite(value);
        case "integer":
            return typeof value === "number" && Number.isInteger(value);
        case "string":
            return typeof value === "string";
        default:
            return false;
    }
}

function resolveRef(root: JsonObject, ref: string): JsonValue {
    if (!ref.startsWith("#/")) {
        throw new Error(`Unsupported $ref in S8 schema: ${ref}`);
    }
    let current: JsonValue = root;
    for (const rawPart of ref.slice(2).split("/")) {
        const part = decodeURIComponent(rawPart).replace(/~1/g, "/").replace(/~0/g, "~");
        if (!isObject(current)) {
            throw new Error(`Unresolved $ref in S8 schema: ${ref}`);
        }
        const next: JsonValue | undefined = current[part];
        if (next === undefined) {
            throw new Error(`Unresolved $ref in S8 schema: ${ref}`);
        }
        current = next;
    }
    return current;
}

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isDateTime(value: string): boolean {
    return DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function validate(value: unknown, currentSchema: unknown, root: JsonObject, path = "$"): ValidationError[] {
    if (currentSchema === true) {
        return [];
    }
    if (currentSchema === false) {
        return [{ keyword: "false", path, message: "false schema" }];
    }
    if (!isObject(currentSchema)) {
        return [];
    }

    const errors: ValidationError[] = [];
    const push = (keyword: string, message: string, errorPath = path) => {
        errors.push({ keyword, path: errorPath, message });
    };

    if (typeof currentSchema.$ref === "string") {
        return validate(value, resolveRef(root, currentSchema.$ref), root, path);
    }

    if (currentSchema.type !== undefined) {
        const types = Array.isArray(currentSchema.type) ? currentSchema.type : [currentSchema.type];
        const valid = types.some((type) => typeof type === "string" && matchesType(value, type));
        if (!valid) {
            push("type", `expected ${types.join(" or ")}`);
            return errors;
        }
    }

    if (currentSchema.const !== undefined && !jsonEqual(value, currentSchema.const)) {
        push("const", `expected constant ${JSON.stringify(currentSchema.const)}`);
    }

    if (
        Array.isArray(currentSchema.enum) &&
        !currentSchema.enum.some((candidate) => jsonEqual(value, candidate))
    ) {
        push("enum", `expected one of ${JSON.stringify(currentSchema.enum)}`);
    }

    if (isObject(value)) {
        if (Array.isArray(currentSchema.required)) {
            for (const key of currentSchema.required) {
                if (typeof key === "string" && !(key in value)) {
                    push("required", `missing required property '${key}'`);
                }
            }
        }

        const properties = isObject(currentSchema.properties) ? currentSchema.properties : {};
        for (const [key, propertySchema] of Object.entries(properties)) {
            if (key in value) {
                errors.push(...validate(value[key], propertySchema, root, `${path}.${key}`));
            }
        }

        if (currentSchema.additionalProperties === false) {
            for (const key of Object.keys(value)) {
                if (!(key in properties)) {
                    push("additionalProperties", `unexpected property '${key}'`);
                }
            }
        } else if (isObject(currentSchema.additionalProperties)) {
            for (const key of Object.keys(value)) {
                if (!(key in properties)) {
                    errors.push(
                        ...validate(value[key], currentSchema.additionalProperties, root, `${path}.${key}`),
                    );
                }
            }
        }
    }

    if (typeof value === "string") {
        if (typeof currentSchema.minLength === "number" && value.length < currentSchema.minLength) {
            push("minLength", `expected at least ${currentSchema.minLength} character(s)`);
        }
        if (currentSchema.format === "date-time" && !isDateTime(value)) {
            push("format", "expected an ISO 8601 date-time");
        }
    }

    if (typeof value === "number") {
        if (typeof currentSchema.minimum === "number" && value < currentSchema.minimum) {
            push("minimum", `expected >= ${currentSchema.minimum}`);
        }
        if (typeof currentSchema.exclusiveMinimum === "number" && value <= currentSchema.exclusiveMinimum) {
            push("exclusiveMinimum", `expected > ${currentSchema.exclusiveMinimum}`);
        }
    }

    if (Array.isArray(value)) {
        if (typeof currentSchema.minItems === "number" && value.length < currentSchema.minItems) {
            push("minItems", `expected at least ${currentSchema.minItems} item(s)`);
        }
        if (isObject(currentSchema.items)) {
            value.forEach((item, index) => {
                errors.push(...validate(item, currentSchema.items, root, `${path}[${index}]`));
            });
        }
    }

    if (Array.isArray(currentSchema.allOf)) {
        for (const branch of currentSchema.allOf) {
            errors.push(...validate(value, branch, root, path));
        }
    }

    if (Array.isArray(currentSchema.anyOf)) {
        const branchResults = currentSchema.anyOf.map((branch) => validate(value, branch, root, path));
        if (!branchResults.some((branchErrors) => branchErrors.length === 0)) {
            push("anyOf", "value does not match any allowed shape");
        }
    }

    if (currentSchema.not !== undefined && validate(value, currentSchema.not, root, path).length === 0) {
        push("not", "value matches a forbidden shape");
    }

    if (currentSchema.if !== undefined) {
        const conditionValid = validate(value, currentSchema.if, root, path).length === 0;
        if (conditionValid && currentSchema.then !== undefined) {
            errors.push(...validate(value, currentSchema.then, root, path));
        } else if (!conditionValid && currentSchema.else !== undefined) {
            errors.push(...validate(value, currentSchema.else, root, path));
        }
    }

    return errors;
}

function collectRefs(value: unknown, refs: string[] = []): string[] {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectRefs(item, refs);
        }
    } else if (isObject(value)) {
        for (const [key, child] of Object.entries(value)) {
            if (key === "$ref" && typeof child === "string") {
                refs.push(child);
            } else {
                collectRefs(child, refs);
            }
        }
    }
    return refs;
}

function expectValid(doc: JsonObject): void {
    expect(validate(doc, schema, schema)).toEqual([]);
}

function expectInvalid(doc: JsonObject, keyword: string, path: string): void {
    const errors = validate(doc, schema, schema);
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ keyword, path })]));
}

const supportedPurposes = stringEnumAt(schema, ["$defs", "lift", "properties", "purpose", "enum"]);

describe("S8 tower-to-mobile schema", () => {
    // A. Valid example
    test("supplied S8 example validates", () => {
        expectValid(canonicalExample);
    });

    // G. General schema integrity
    test("schema declares Draft 2020-12", () => {
        expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    });

    test("all local $refs resolve", () => {
        const refs = collectRefs(schema);
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) {
            expect(() => resolveRef(schema, ref)).not.toThrow();
        }
    });

    // B. Rigging mass
    test("accepts positive numeric rigging mass", () => {
        const doc = cloneExample();
        set(lift(doc), "rigging_mass_t", 0.35);
        expectValid(doc);
    });

    test("accepts zero rigging mass (schema uses non-negative minimum)", () => {
        const doc = cloneExample();
        set(lift(doc), "rigging_mass_t", 0);
        expectValid(doc);
    });

    test("accepts null rigging mass with an empty issues array", () => {
        const doc = cloneExample();
        set(lift(doc), "rigging_mass_t", null);
        set(doc, "issues", []);
        expectValid(doc);
    });

    test("rejects negative rigging mass", () => {
        const doc = cloneExample();
        set(lift(doc), "rigging_mass_t", -0.1);
        expectInvalid(doc, "minimum", "$.lifts[0].rigging_mass_t");
    });

    test("rejects string rigging mass", () => {
        const doc = cloneExample();
        set(lift(doc), "rigging_mass_t", "0.35");
        expectInvalid(doc, "type", "$.lifts[0].rigging_mass_t");
    });

    test("rejects boolean rigging mass", () => {
        const doc = cloneExample();
        set(lift(doc), "rigging_mass_t", true);
        expectInvalid(doc, "type", "$.lifts[0].rigging_mass_t");
    });

    // C. Required fields
    for (const field of [
        "schema_version",
        "handoff_id",
        "created_at",
        "units",
        "coordinate_frame",
        "tower_crane",
        "lifts",
        "issues",
    ]) {
        test(`rejects missing top-level field: ${field}`, () => {
            const doc = cloneExample();
            remove(doc, field);
            expectInvalid(doc, "required", "$");
        });
    }

    for (const field of [
        "lift_id",
        "purpose",
        "component",
        "pick_xy",
        "set_xy",
        "rigging_mass_t",
        "coordinate_source",
    ]) {
        test(`rejects missing lift field: ${field}`, () => {
            const doc = cloneExample();
            remove(lift(doc), field);
            expectInvalid(doc, "required", "$.lifts[0]");
        });
    }

    for (const field of ["name", "mass_t", "mass_basis", "mass_source"]) {
        test(`rejects missing component field: ${field}`, () => {
            const doc = cloneExample();
            remove(component(doc), field);
            expectInvalid(doc, "required", "$.lifts[0].component");
        });
    }

    test("rejects mass_source without kind", () => {
        const doc = cloneExample();
        remove(massSource(doc), "kind");
        expectInvalid(doc, "required", "$.lifts[0].component.mass_source");
    });

    // D. Lift purposes
    test("purpose enum matches the v0.4 supported set", () => {
        expect(supportedPurposes).toEqual(["tower_erection", "dismantling", "site_material_handling"]);
    });

    for (const purpose of supportedPurposes) {
        test(`accepts supported purpose: ${purpose}`, () => {
            const doc = cloneExample();
            set(lift(doc), "purpose", purpose);
            expectValid(doc);
        });
    }

    test("rejects unsupported lift purpose", () => {
        const doc = cloneExample();
        set(lift(doc), "purpose", "inspection");
        expectInvalid(doc, "enum", "$.lifts[0].purpose");
    });

    // E. Component mass provenance
    test("accepts numeric component mass with page provenance", () => {
        expectValid(cloneExample());
    });

    test("accepts numeric component mass with section provenance", () => {
        const doc = cloneExample();
        remove(massSource(doc), "page");
        set(massSource(doc), "section", "4.2");
        expectValid(doc);
    });

    test("rejects numeric component mass without mass_source", () => {
        const doc = cloneExample();
        remove(component(doc), "mass_source");
        expectInvalid(doc, "required", "$.lifts[0].component");
    });

    test("rejects numeric component mass without document provenance", () => {
        const doc = cloneExample();
        remove(massSource(doc), "document");
        expectInvalid(doc, "required", "$.lifts[0].component.mass_source");
    });

    test("rejects numeric component mass without page or section provenance", () => {
        const doc = cloneExample();
        remove(massSource(doc), "page");
        expectInvalid(doc, "anyOf", "$.lifts[0].component.mass_source");
    });

    test("rejects numeric component mass with not_stated provenance", () => {
        const doc = cloneExample();
        set(massSource(doc), "kind", "not_stated");
        expectInvalid(doc, "not", "$.lifts[0].component.mass_source.kind");
    });

    test("rejects zero component mass", () => {
        const doc = cloneExample();
        set(component(doc), "mass_t", 0);
        expectInvalid(doc, "exclusiveMinimum", "$.lifts[0].component.mass_t");
    });

    test("rejects negative component mass", () => {
        const doc = cloneExample();
        set(component(doc), "mass_t", -2.4);
        expectInvalid(doc, "exclusiveMinimum", "$.lifts[0].component.mass_t");
    });

    test("accepts null component mass with not_stated provenance", () => {
        const doc = cloneExample();
        set(component(doc), "mass_t", null);
        component(doc)["mass_source"] = { kind: "not_stated" };
        expectValid(doc);
    });

    test("rejects null component mass with stated provenance", () => {
        const doc = cloneExample();
        set(component(doc), "mass_t", null);
        expectInvalid(doc, "const", "$.lifts[0].component.mass_source.kind");
    });

    test("accepts null component mass with not_stated and empty issues", () => {
        const doc = cloneExample();
        set(component(doc), "mass_t", null);
        component(doc)["mass_source"] = { kind: "not_stated" };
        set(doc, "issues", []);
        expectValid(doc);
    });

    // F. Missing-mass issue policy and runtime contract documentation
    test("documents producer/runtime issue responsibility and INCOMPLETE contract", () => {
        const riggingDescription = descriptionAt(schema, ["$defs", "lift", "properties", "rigging_mass_t"]);
        expect(riggingDescription).toContain("structurally valid");
        expect(riggingDescription).toContain("producer/runtime");
        expect(riggingDescription).toContain("INCOMPLETE");
        expect(riggingDescription).toContain("calculateLiftCheck");
        expect(riggingDescription).toContain("never receive a null rigging mass");
        expect(riggingDescription).toContain("not a new M2 calculation outcome");

        const issuesDescription = descriptionAt(schema, ["properties", "issues"]);
        expect(issuesDescription).toContain("does not require a non-empty issues array");
        expect(issuesDescription).toContain("producer/runtime");

        const componentMassDescription = descriptionAt(schema, [
            "$defs",
            "component",
            "properties",
            "mass_t",
        ]);
        expect(componentMassDescription).toContain("does not require a non-empty issues array");
        expect(componentMassDescription).toContain("producer/runtime");
    });
});
