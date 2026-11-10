# DGOC Tower Crane Planner plugin

Sourced tower-crane catalogue, capacity model, placement and clearance checks for the DGOC Crane
Planner. The catalogue contains four entries:

- **Potain MCT 88** (EN 14439 C25) — published per-radius 5 t hook chart lookup. Default entry.
- **Potain MCT 85 F5** (FEM 1.001-A3) — published per-radius load-chart lookup.
- **JASO J438PA.2R, 213 ft TD** (EN 14439 C25 / FEM 1005-C25) — `INDICATIVE` luffing-jib
  configuration. Listed but **not evaluated** by the trolley-jib capacity engine.
- **JASO J438PA.2R, 213 ft 2R** — the second `INDICATIVE` configuration of the same JASO model,
  also listed but not evaluated.

The two JASO rows are configurations of one crane model, not two separate models. The 213 ft TD/2R
choice is `INDICATIVE` because the datasheet also publishes shorter jibs; the chart values themselves
are transcribed from the PDF.

> **Planning aid, not a certified lift plan.**

## What is here

| Path | Purpose |
| --- | --- |
| `data/crane-catalogue.json` | Crane data. Every number carries a source (document + page) or is explicitly `INDICATIVE`. |
| `src/catalogueValidator.ts` | Strict JSON validator. Rejects bare numbers, unknown sources, malformed tip tables and load charts, missing `notStated` reasons, `notStated` heaviest components on the Potain trolley-jib entries, wrong entry counts and a non-MCT 88 default. `notStated` is permitted for the JASO model. |
| `src/catalogue.ts` | Validates the JSON at module load and exposes `MCT88`, `MCT85F5`, `JASO_TD`, `JASO_2R`, `TOWER_CRANES` and `getCraneById`. |
| `src/capacity.ts` | MCT 88 and MCT 85 F5 published chart lookup, the `SIMULATED` wind rule and the luffing-jib guard. |
| `src/pickEngine.ts` | UI-independent pick evaluation, utilisation, PASS/FAIL and crane filtering. |
| `src/units.ts` | One-way metre → millimetre conversion for the Chili3D scene boundary. |
| `src/command.ts` | Three-pick sample dialog for the selected catalogue crane. |
| `src/commands/placeCrane.ts` | `Place Tower Crane` command that opens the live placement panel. |
| `src/model/cranePlacement.ts` | Placement/ring geometry and the INDICATIVE T7 catalogue defaults. |
| `src/geometry/clearance.ts` | Pure T6 clearance kernel: point-in-polygon, distances, swing circle versus polygon and annulus/band versus polygon. |
| `src/ui/placementPanel.ts` | Live float panel for mast position, slew and INDICATIVE radii. |
| `src/view/craneScene.ts` | Three.js rings, jib and counter-jib scene for the placement panel. |
| `docs/SOURCES.md` | Source table, page convention, capacity methods, ambiguities and limitations. |

## Placement, clearance and rings (T6/T7)

### T6 clearance kernel

Pure TypeScript helpers in `src/geometry/clearance.ts` for sample-site clearance checks. The kernel
covers point-in-polygon, distances, a swing circle versus polygon, and
`checkAnnulusPolygonIntersection` for a radial band (inner/outer radius) versus polygon, including
edges that cross the band and polygons that enclose it. See `test/clearance.test.ts` for worked
examples.

### T7 placement and rings

`Place Tower Crane` opens a live float panel and draws:

- maximum hook-radius ring (solid orange)
- minimum hook-radius ring (dashed green)
- counter-jib sweep ring (dashed blue)
- fixed 20 m base-exclusion ring (dashed grey)
- jib, counter-jib and mast marker

Drag the mast marker in the viewport, type mast coordinates, or move the slew slider. Every change
updates the rings and result panel immediately; there is no Calculate button.

The T7 placement panel's internal catalogue dimensions are placeholders marked `INDICATIVE`; they are
not sourced crane data. The catalogue/capacity module uses the sourced values documented under
**Crane data** below. Replace placement defaults from the applicable load chart and cite the document
and page before using the result.

**Planning aid, not a certified lift plan.**

## Crane data

| Crane | Catalogue standard | Max capacity | Max working jib | Minimum radius | Default jib | Capacity source |
| --- | --- | --- | --- | --- | --- | --- |
| Potain MCT 88 | EN 14439 C25 | 5 t | 52 m | 2.7 m (printed) | 30 m (`INDICATIVE`) | Upper 5 t hook per-radius chart, datasheet p. 4 |
| Potain MCT 85 F5 | FEM 1.001-A3 | 5 t | 52 m | 2.7 m (printed) | 30 m (`INDICATIVE`) | Per-radius chart, datasheet p. 3 |
| JASO J438PA.2R (213 ft TD) | EN 14439 C25 / FEM 1005-C25 | 16.0118 t (converted) | 64.9224 m (213 ft) | 24.9936 m (82 ft) | 213 ft (`INDICATIVE`) | Imperial chart, p. 2; not evaluated (luffing-jib) |
| JASO J438PA.2R (213 ft 2R) | EN 14439 C25 / FEM 1005-C25 | 18.0076 t (converted) | 64.9224 m (213 ft) | 24.9936 m (82 ft) | 213 ft (`INDICATIVE`) | Imperial chart, p. 2; not evaluated (luffing-jib) |

The `Catalogue standard` column records the standard associated with each catalogue entry, not
necessarily the standard printed on every source document. For the MCT 88, the e-catalogue URL
identifies **EN 14439 C25**, whereas the inspected 8-page MCT 88 PDF prints **FEM 1.001-A3** on all
eight pages and does not print EN 14439 C25. Both attributions are preserved; they are **not** claimed
to be equivalent. Which standard the `standard` field should represent remains pending mentor
confirmation.

For both Potain cranes, 53.1 m is the overall tip length, not a working jib configuration. The
published Potain working configurations are 20, 25, 30, 35, 40, 45, 50 and 52 m. The JASO chart values
are converted from feet and pounds with 1 ft = 0.3048 m and 1 lb = 0.00045359237 t; the imperial
labels are the source. The JASO `maxCapacityT` is the first chart value, not a separately printed
maximum-capacity label.

## Capacity models

### MCT 88 — published chart lookup

The MCT 88 uses the upper **5 t hook** per-radius table on datasheet p. 4 for all eight published jib
configurations (20, 25, 30, 35, 40, 45, 50 and 52 m; 86 chart points). The lower table on the same
page is the **3 t hook** table and is not used for the catalogue's capacity or tip-load values.

- The installed jib must be exactly one of the eight published configurations; otherwise the result
  is `INVALID`.
- The printed minimum hook radius is 2.7 m. A radius below 2.7 m is `OUT_OF_RANGE`.
- From 2.7 m to the first stored point the 5 t plateau applies; the first stored point is the end of
  the plateau, not the minimum radius.
- Between chart points, the capacity at the **next larger radius** is used (the lower bounding value).
  No interpolation is used.
- There is no extrapolation beyond the last published radius.

The runtime capacity is selected from this chart, not calculated with the old Cycle 2 inverse-radius
(`M / r`) formula. For example, on the 30 m jib, 20 m returns 3.9 t, 28 m returns 2.5 t (the 29 m
point), and 30 m returns 2.5 t. On the 52 m jib, 39.20 m returns 1.55 t (the 40 m point), 47.20 m
returns 1.15 t (the 50 m point), and 52 m returns 1.10 t. The chart is numerically identical to the
MCT 85 F5 chart except at the 25 m jib endpoint (MCT 88 3.00 t; MCT 85 F5 3.02 t).

### MCT 85 F5 — published chart lookup

The MCT 85 F5 uses its own manufacturer chart. The lookup rules are the same as the MCT 88 chart
rules, but the two source pages must not be mixed:

- The installed jib must be exactly one of the eight published configurations; otherwise the result
  is `INVALID`.
- The printed minimum hook radius is 2.7 m and is stored on every chart row. A radius below 2.7 m is
  `OUT_OF_RANGE`; the 5 t plateau does not extend below the published minimum.
- The base capacity is read from that jib's chart row. From 2.7 m to the first stored point the 5 t
  plateau applies; the first stored point is the end of the plateau, not the minimum radius.
- Between chart points, the capacity at the **next larger radius** is used (the lower bounding value).
  This cannot overstate the published capacity, though it may understate it between points.
- There is no extrapolation beyond the last published radius.
- The chart is the 5 t hook curve; a dashed variant annotation is not modelled or treated as a
  general capacity deduction.

For example, on the 30 m jib, 19 m returns 3.9 t (the 20 m point), not the linearly interpolated
4.48 t; 24 m returns 3.0 t (the 25 m point); 28 m returns 2.5 t (the 29 m point).

### JASO J438PA.2R — listed but not evaluated

The JASO entries are **luffing-jib** cranes. Their published charts are stored with p. 2 provenance,
but the current capacity engine models a trolley jib and cannot represent luffing geometry. For these
entries:

- `capacityAt` returns `null`, even for a radius printed in the chart;
- a pick is reported as `UNSUPPORTED` with issue `unsupported-crane-type`, not as PASS/FAIL;
- the selection matrix lists the rows but excludes them from `evaluatedCraneCount` and never counts
  them as passing; when every entry is luffing-jib the matrix state is `no-supported-cranes`.

The safeguard is deliberate. It prevents an imperial luffing-jib chart from being read through the
trolley-jib formula and presented as an equivalent capacity result. See
[`docs/SOURCES.md`](docs/SOURCES.md) §6.

### Wind

The optional wind rule multiplies the base capacity by 0.8 at 20 km/h or above. It is labelled
`SIMULATED` in the code and UI and is not claimed to be EN 14439 Table 7 or a manufacturer rule. It is
applied once, after the crane-specific base capacity. A blank or `null` wind means no derate; a
negative or non-finite wind is `INVALID` with issue `invalid-wind` instead of being treated as calm.

## Sample picks

The MCT 88 and MCT 85 F5 tables use the catalogue default 30 m jib.

**MCT 88**

| Pick | Load | Radius | Capacity | Utilisation | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.5 t | 20 m | 3.90 t | 64.1 % | PASS |
| 2 | 3.0 t | 25 m | 3.00 t | 100.0 % | PASS |
| 3 | 4.0 t | 30 m | 2.50 t | 160.0 % | FAIL |

The third row is the acceptance case from `BACKLOG.md`: a 4 t pick at 30 m on the 30 m jib must fail.

**MCT 85 F5**

| Pick | Load | Radius | Capacity | Utilisation | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.5 t | 20 m | 3.90 t | 64.1 % | PASS |
| 2 | 3.0 t | 25 m | 3.00 t | 100.0 % | PASS |
| 3 | 4.0 t | 30 m | 2.50 t | 160.0 % | FAIL |

## Heaviest erection component

- **MCT 88:** counter-jib, 4.38 t (variant A, 11.9 m), datasheet p. 6; variant B is 4.25 t at the same
  11.9 m. The p. 1 drawing's 13.7 m / 11.3 m counter-jib radius is a different dimension.
- **MCT 85 F5:** counter-jib, 4.38 t (variant A, 14.6 m), datasheet p. 5; variant B is 4.25 t / 11.9 m.
  Do not apply the MCT 88 11.9 m / 4.38 t pairing to the MCT 85 F5 table.
- **JASO J438PA.2R:** `notStated`. The pp. 6-7 packing list gives transport packages, not an
  erection-component schedule. The heaviest listed package is a **combined** counter-jib +
  mechanisms + reeving block + auxiliary jib package of 45,310 lb (20.5523 t), stored separately
  as `combinedTransportPackage`; it is not an individual erection lift. The PDF separately lists a
  26,150 lb package described as counter-jib + luffing mechanisms + reeving block + auxiliary jib. It
  is a different transport package and is not added as a catalogue entry because the schema stores
  only one combined package.

`validateCatalogue` requires a stated component with a positive mass for the two Potain trolley-jib
entries; `notStated` is permitted only for the JASO model.

These are component-weight tables, not erection sequences. They do not state the lift radius, rigging
or assembly order. Confirm the actual heaviest lift against the manufacturer's erection manual before
use.

## Build and test

```bash
npx rstest plugins/tower-planner/test
npm run build -w tower-planner
```

The plugin is registered in `scripts/build-plugins.mjs` so the production build copies its
`manifest.json`, `icons/` and `dist/` to `dist/plugins/tower-planner/`. The build does **not** copy
`docs/`, so the source PDFs stay out of the distributable. The build fails if a PDF appears anywhere
in the copied plugin directory.

## Limitations

- Four catalogue entries are present: two sourced Potain trolley-jib cranes and two `INDICATIVE`
  JASO luffing-jib configurations. The JASO rows are listed but **not evaluated** by the
  trolley-jib capacity engine; their capacity charts are stored, but `capacityAt` refuses them and
  picks are `UNSUPPORTED`. See [`docs/SOURCES.md`](docs/SOURCES.md) §6.
- The MCT 88 and MCT 85 F5 30 m default jib is `INDICATIVE` project configuration, not a manufacturer
  recommendation. The JASO 213 ft TD/2R configuration choice is `INDICATIVE` for the same reason: the
  datasheet publishes other jib lengths.
- The model is not a structural, dynamic, reeving or ground-bearing check.
- The MCT 88 p. 4 page contains two hook tables: the upper 5 t table used for all eight jib
  configurations and a lower 3 t table that is recorded but not used. The p. 1 summary labels do not
  all equal the upper table (for example, 30 m: p. 1 2.70 t vs chart 2.50 t; 52 m: p. 1 1.15 t vs
  chart 1.10 t). The catalogue follows the p. 4 upper table. The load-curve page is p. 4 in the local
  PDF; a Cycle 2 mirrored copy recorded p. 3, which remains unverified. A dashed `-0.245 t`
  annotation on p. 4 is not treated as a general deduction and is not modelled. See
  [`docs/SOURCES.md`](docs/SOURCES.md) §3.
- The MCT 85 F5 p. 1 tip table labels 25 m as 3.0 t, while the p. 3 chart prints 3.02 t. The tip table
  keeps the p. 1 label; the capacity lookup uses the p. 3 point.
- `BACKLOG.md` refers to `docs/validation-calculation.txt`. No original was found in the working tree
  or Git history; [`docs/validation-calculation.txt`](docs/validation-calculation.txt) is a clearly
  labelled **reconstruction**, not the recovered original. See [`docs/SOURCES.md`](docs/SOURCES.md) §7.
- The JASO mast width, base width, counter-jib structural length, counter-jib radius and heaviest
  erection component are `notStated` because the inspected PDF does not publish them. They are not
  inferred from other dimensions or from the combined transport package.
- No redistribution licence was verified for the MCT 88, MCT 85 F5 or Jaso PDFs. Confirm the
  manufacturer's terms before packaging or mirroring them. The PDFs are ignored by Git, and the
  production build copies only `manifest.json`, `icons/` and `dist/`, so they are not in
  `dist/plugins/tower-planner/`.
