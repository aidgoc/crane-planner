# Site Model Plugin (`@chili3d/site-model`)

Shared site planning foundation for DGOC Crane Planner (Cycle 4).  
Lead: Ajit Kolhatkar. Reviewed by Tower & Mobile planner teams.

> **"Planning aid, not a certified lift plan."**

---

## Capabilities (Check-in 1: S1–S4)

1. **S1 — DXF Parser & Dynamic Boundary Chaining**:
   - Parses AutoCAD DXF files (ASCII R12–2000+) using `dxf-parser`.
   - Reassembles `SITE_BOUNDARY` segments (`LINE` and `ARC`) by chaining endpoints dynamically into a closed polyline loop without any hardcoded coordinates.
   - Supports both counter-clockwise (CCW) and clockwise (CW) arc traversal, splicing sampled arc vertices seamlessly.
   - Calculates the exact enclosed site area using the Shoelace formula on the real chained polygon.
   - Verifies translation-invariance (a +100 m shift of DXF text coordinates preserves area and relocates the boundary).
   - Dynamically parses proposed buildings, temporary works, neighbour properties, supply zones, road corridors, power lines, and no-go zones from their respective layers and annotation text.

2. **S2 — Unit Conversion at Scene Boundary**:
   - Internal site data and JSON schema are strictly in **metres ($m$)**.
   - Chili3D / OpenCascade CAD scene boundary converts to **millimetres ($mm$)** ($40\text{ m} \leftrightarrow 40,000\text{ mm}$).
   - `metresToMm()` and `mmToMetres()` helpers enforce single-sourced unit transforms.

3. **S3 — 3D Building Extrusion**:
   - 2D footprint polygons are extruded along the Z-axis into 3D solid B-Rep shapes via the OpenCascade WebAssembly kernel.
   - Tested volume for Tower A ($40\text{ m} \times 22\text{ m} \times 75\text{ m} = 66,000\text{ m}^3$).

4. **S4 — Project JSON Schema v1**:
   - Standardized format (`SiteProject`) shared across both Tower Crane Planner and Mobile Crane Planner.
   - Full save/load round-trip validation.
   - Rejects invalid data and enforces the mandatory planning-aid disclaimer.

---

## Boundary Parser Specification & Known Limitations

The parser is designed for construction site layout drawings with the following specifications and current conventions:

| Entity / Feature | Implementation Status | Notes & Workarounds |
|:---|:---:|:---|
| **Boundary Lines (`LINE`)** | Supported | Chained endpoint-to-endpoint with $1\mu\text{m}$ tolerance (`1e-6`). |
| **Corner Fillet (`ARC`)** | Supported (CCW & CW) | Spliced at the matching endpoint. Both traversal directions handled. |
| **Loop Closure** | Enforced | Throws `Error("Boundary loop does not close: endpoints do not meet.")` if any segment is disconnected or endpoints do not rejoin. |
| **Boundary as `LWPOLYLINE`** | Deferred to v2 | Drawings should author site boundary as chained `LINE` and `ARC` entities (or explode polylines before export). |
| **Multiple Boundary Arcs** | Partial | Current sample site uses 1 corner fillet arc (R10 NE). Sites with multiple arcs should ensure continuous endpoint alignment. |
| **Building Labels & Heights** | Dynamic | Paired from the `ANNOTATION` `TEXT` entity following each `LWPOLYLINE`. Heights are parsed from label strings (e.g., `"TOWER A G+24 75.0 m"` $\to 75\text{ m}$) or overridden via options. |

---

## S7 — Shared Report Helper (Sujal)

One HTML report format for both products. The output is a self-contained, A4 print-ready page. The
person uses the browser's **Print / Save PDF** button to get a PDF. The helper does not make a PDF or PNG
file by itself. BACKLOG S7 says "PDF/PNG": please confirm with Sir that print-to-PDF is enough for S7.

**How M9 (mobile) and T10 (tower) import it.** Plugins are built as separate bundles, so a consumer
imports the source with a relative path, and the helper is bundled into the consumer's own `main.js`:

```ts
import { generateReportHtml, openReportPrintWindow, type ReportData } from "../../site-model/src/report";
```

(Checked: a probe file in `plugins/mobile-planner/src` with this import passes `tsc` and the plugin
build, and the helper text is found in the built `main.js`. The probe was not committed.)

Rules the helper enforces (all throw `RangeError` before any HTML is built):

- `metadata`: title, project name and author are not blank; `date` is a real `YYYY-MM-DD` date;
  `product` is `mobile-planner` or `tower-planner` (the product label comes from it).
- Statuses are kept as given and are never mapped to PASS or FAIL: `PASS`, `FAIL`, `WARN`, `INFO`,
  `OUT_OF_RANGE`, `INVALID`, `UNSUPPORTED`, `NOT_CHECKED`. A verdict can also be `INCOMPLETE`.
  Source status is `VERIFIED`, `INDICATIVE`, `LEGACY` or `NOT_STATED`.
- A metric marked `PASS` must have a usable value. A missing value (`undefined`, `null`, `NaN`,
  `Infinity`, blank) is printed as an em dash, without its unit.
- `planView.imageDataUrl` must be a `data:image/...` URL. `planView.svgContent` is shown through an
  `<img>` data URL, so scripts in it do not run.
- The planning-aid disclaimer is always printed (banner and footer). `metadata.disclaimer` is ignored.

Known limits: the page is not tested in a real browser print dialog (the tests check the HTML and the
`@media print` rules); a row status is shown as a text badge plus a row colour, and colours only print if
the browser prints background colours (the helper asks for it with `print-color-adjust: exact`).

---

## Build & Test

```bash
# Run acceptance test suite
npx rstest plugins/site-model/test/siteModel.test.ts

# Run production build
npm run build

# Preview plugin in local dev server (port 8686)
npm run preview
```

