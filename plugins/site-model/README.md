# Site Model Plugin (`@chili3d/site-model`)

Shared site planning foundation for DGOC Crane Planner (Cycle 4).  
Lead: Ajit Kolhatkar. Reviewed by Tower & Mobile planner teams.

> **"Planning aid, not a certified lift plan."**

---

## Capabilities

### Check-in 1 (S1–S4)
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

### Check-in 2 (S5, S6 & Ribbon Commands)
5. **S5 — Image Underlay Scale Calibration (`src/imageUnderlay.ts`)**:
   - Calibrates 2D aerial imagery and plan scans with 2 user clicks on known scale points. The sample-site.png scale bar is 0–20 m (92 px = 20 m → ~0.2174 m/px, about 0.22 m/px). On this image, Tower A width (183 px) reads 39.78 m (0.54% error, well within 1% acceptance tolerance). Synthetic unit tests verify scale conversion and distance calculations.
   - Transforms bi-directionally between image pixel coordinates and site world coordinates (counter-clockwise rotation).

6. **S6 — Polygon Draw / Edit Engine (`src/polygonEditor.ts`)**:
   - Interactive vertex-level editing for buildings, roads, power lines, and no-go zones.
   - Real-time Shoelace area calculation ($10 \times 10\text{ m} = 100\text{ m}^2$, edited to right trapezoid $((10+12)/2)\times 10 = 110\text{ m}^2$) and transactional Undo/Redo stack for add, remove, and vertex edits.

7. **Load Sample Site Command (`src/commands/loadSampleSite.ts`)**:
   - Registered under the **Manager** ribbon tab as `"Load Sample Site"`.
   - Instantiates 3D parametric `BuildingBodyNode` solids for Tower A (75m), Tower B (45m), Podium (9m), Site Office (3m), and Neighbours in the active Chili3D document and renders them in the Three.js viewport. Idempotent: repeated clicks replace previous sample site nodes without creating duplicates.

---

## Hazard Clearances & Downstream Application (Review Point 2)

- **Power Line Hazard (`clearance_m`)**: The `clearance_m` property on `PowerLineZone` (default `6.0 m` in the sample site) is a required safety buffer stored in the site model schema.
- **Downstream Application**: The site model serves as the single source of truth for site obstacle geometry and safety clearance specifications. Physical clearance evaluation is carried out downstream:
  - **Mobile Crane Planner (M6 / M8)**: Evaluates 3D and 2D boom clearance to the power line corridor and flags safety violations if distance < `clearance_m`.
  - **Tower Crane Planner (T8)**: Evaluates slew circle oversail vs the power line buffer (`voltage_kv` and `clearance_m`).
- **Synthetic Test Fixture**: The `6.0 m` value used in unit tests (`test/siteModel.test.ts`) is a synthetic test fixture from `public/sample-site/README.md` (INDICATIVE sample clearance for a 22 kV overhead line), not a certified regulatory standard.

---

## Boundary Parser Specification & Known Limitations

| Entity / Feature | Implementation Status | Notes & Workarounds |
|:---|:---:|:---|
| **Boundary Lines (`LINE`)** | Supported | Chained endpoint-to-endpoint with $1\mu\text{m}$ tolerance (`1e-6`). |
| **Corner Fillet (`ARC`)** | Supported (CCW & CW) | Spliced at the matching endpoint. Both traversal directions handled. |
| **Loop Closure** | Enforced | Throws `Error("Boundary loop does not close: endpoints do not meet.")` if any segment is disconnected or endpoints do not rejoin. |
| **Boundary as `LWPOLYLINE`** | Deferred to v2 | Drawings should author site boundary as chained `LINE` and `ARC` entities (or explode polylines before export). |
| **Multiple Boundary Arcs** | Partial | Current sample site uses 1 corner fillet arc (R10 NE). Sites with multiple arcs should ensure continuous endpoint alignment. |
| **Building Labels & Heights** | Dynamic | Paired from the `ANNOTATION` `TEXT` entity following each `LWPOLYLINE`. Heights are parsed from label strings (e.g., `"TOWER A G+24 75.0 m"` $\to 75\text{ m}$) or overridden via options. |
| **Self-Crossing Polygons** | Known Limit | Bowtie / self-crossing polygons must be avoided; non-positive area polygons are rejected with `Result.err`. |

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
npx rstest plugins/site-model/test/

# Run production build
npm run build

# Preview plugin in local dev server (port 8686)
npm run preview
```
