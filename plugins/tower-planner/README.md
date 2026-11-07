# DGOC Tower Crane Planner plugin

Sourced tower-crane catalogue, capacity model, placement and clearance checks for the DGOC Crane
Planner. The catalogue contains two verified entries:

- **Potain MCT 88** (EN 14439 C25) — Cycle 2 idealised tip-load model.
- **Potain MCT 85 F5** (FEM 1.001-A3) — published per-radius load-chart lookup.

> **Planning aid, not a certified lift plan.**

## What is here

| Path | Purpose |
| --- | --- |
| `data/crane-catalogue.json` | Crane data. Every number carries a source (document + page) or is explicitly `INDICATIVE`. |
| `src/catalogueValidator.ts` | Strict JSON validator. Rejects bare numbers, unknown sources, malformed tip tables and malformed load charts. |
| `src/catalogue.ts` | Validates the JSON at module load and exposes `MCT88`, `MCT85F5`, `TOWER_CRANES` and `getCraneById`. |
| `src/capacity.ts` | MCT 88 tip-load model, MCT 85 F5 chart lookup and the `SIMULATED` wind rule. |
| `src/pickEngine.ts` | UI-independent pick evaluation, utilisation, PASS/FAIL and crane filtering. |
| `src/units.ts` | One-way metre → millimetre conversion for the Chili3D scene boundary. |
| `src/command.ts` | Three-pick sample dialog for the selected catalogue crane. |
| `src/commands/placeCrane.ts` | `Place Tower Crane` command that opens the live placement panel. |
| `src/model/cranePlacement.ts` | Placement/ring geometry and the INDICATIVE T7 catalogue defaults. |
| `src/geometry/clearance.ts` | Pure T6 clearance kernel: point-in-polygon, distances, swing circle versus polygon and annulus/band versus polygon. |
| `src/geometry/oversailGeometry.ts` | T8 geometry helpers for boundaries, neighbours, no-go zones, roads and power lines. |
| `src/model/oversailChecks.ts` | T8 oversail checks with PASS/FAIL/PERMISSION NEEDED results. |
| `src/model/oversailTypes.ts` | T8 site, obstacle and check-result types. |
| `src/model/siteSnapshot.ts` | Adapts the shared v1 site format and the legacy sample file into an `OversailSite`, including metre-unit validation. |
| `src/model/heightChecks.ts` | Pure T9 hook-height, freestanding-height and tie-in checks. |
| `src/model/heightTypes.ts` | T9 height inputs, results and status types. |
| `src/ui/placementPanel.ts` | Live float panel for mast position, slew, INDICATIVE radii, oversail and height checks. |
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
- fixed 20 m base-exclusion ring (dashed grey, `INDICATIVE`)
- jib, counter-jib and mast marker

Drag the mast marker in the viewport, type mast coordinates, or move the slew slider. Every change
updates the rings and result panel immediately; there is no Calculate button.

The T7 placement panel's internal catalogue dimensions are placeholders marked `INDICATIVE`; they are
not sourced crane data. The catalogue/capacity module uses the sourced values documented under
**Crane data** below. Replace placement defaults from the applicable load chart and cite the document
and page before using the result. The fixed 20 m base-exclusion radius is also `INDICATIVE`; confirm
the crane base and exclusion zone from the manufacturer before use.

## T8 oversail checks

The placement panel recalculates clearance checks on every valid change and shows each result as `PASS`, `FAIL` or `PERMISSION NEEDED`, plus an overall status:

- **Site boundary** — a jib envelope outside the plot is reported as a fail because no boundary oversail rule was supplied; this is a planning constraint, not a quoted standard.
- **Road** — modelled as a horizontal band between `yFromM` and `yToM`, infinite in X.
- **Overhead power line** — modelled as a vertical line at `xM`, infinite in Y. Required distance is jib radius plus clearance. The sample 6 m clearance is labelled `INDICATIVE`.
- **Neighbours** — only buildings named in `no_oversail` or `oversail_by_permission` are checked. Overflying a `no_oversail` neighbour fails; a permission neighbour returns `PERMISSION NEEDED`.
- **No-go zones** — circular exclusion zones; any overlap with the jib envelope fails.

The check covers the jib/full hook envelope only, not the counter-jib. Supply zones (`S1` rebar yard, `S2` formwork store, `S3` concrete pump) are not treated as obstacles. Proposed buildings are not treated as neighbours unless they are explicitly named in the neighbour rule arrays.

`src/model/siteSnapshot.ts` adapts the shared v1 site format and the legacy sample file into an `OversailSite`. The adapter requires metre units (`units: "m"`); missing, unsupported or invalid units are rejected before any check runs. The legacy sample has no boundary vertex list; the panel then shows `Site data unavailable...` and does not report a boundary result. Boundary geometry is never approximated from plot width/depth.

## T9 height and tie-in checks

`src/model/heightChecks.ts` is a pure TypeScript check with hand-worked tests. Building heights come from the shared site model (`buildings[].heightM`, metres above the same ground datum).

- **Controlling height** — the tallest individual building roof above ground. Heights are **not summed**: the sample's Tower A is 75 m and the podium is a separate 9 m lower roof, so the controlling height is 75 m, not 84 m. This follows BACKLOG T9/S3 (the Tower A solid is 40 x 22 x 75 m "before the podium") and the sample-site README ("hook clear Tower A at 75 m plus clearance").
- **Required hook height** — controlling building height + hook clearance. With the default INDICATIVE 2 m clearance and Tower A at 75 m, the requirement is **77 m**.
- **Hook check** — the available hook height must be at least the required hook height; otherwise the check fails and reports the shortfall.
- **Freestanding check** — if the required hook height exceeds the freestanding height, the result is `TIE-IN REQUIRED`.
- **Tie-in levels** — INDICATIVE levels above ground, starting at the freestanding limit and repeating every tie-in spacing until the required hook height is covered. For 77 m required, 50 m freestanding and 20 m spacing: 50 m, 70 m. The crane supplier's tie-in schedule governs.

Hook height, hook clearance, freestanding height and tie-in spacing are all shown as `INDICATIVE`; replace them with the supplied crane configuration or the project/standard value and cite the source. Missing or invalid building heights make the height check `UNAVAILABLE` rather than passing silently.

## Shared site data source

The site-model plugin owns the production DXF path: `src/siteSource.ts` exposes `loadSiteProjectFromDxf` and `loadSiteProjectFromUrl`. `PlaceTowerCraneCommand` loads the shared `sample-site/sample-site.dxf` through that source, validates it with the site-model schema, then adapts the resulting `SiteProject` with `adaptSiteSnapshot`. There is no second site schema and no invented `document.userData` key.

The fixed `sample-site/sample-site.dxf` URL is an **interim** site-data source. It is used only until a project-file picker or an active shared-site selection is implemented; it is not a project-file selector and does not represent a user's site. The sample data and its limitations are documented in `public/sample-site/README.md`.

If the DXF cannot be fetched or parsed, or adaptation fails, the command shows the `towerplanner.site.unavailable` toast and opens the panel without site data. T8 and T9 then report `UNAVAILABLE`; they never substitute a fabricated site or return a false `PASS`.

## Placement persistence

The crane placement is a **temporary plan overlay**, not a persistent document node. It is drawn as overlay meshes by `CraneScene`, is not written to the document or `document.userData`, and is not serialized. Closing the panel, closing the view or document, or disposing the panel removes the overlay meshes. Persistent crane document storage is not implemented in this PR.

**Planning aid, not a certified lift plan.**

## Crane data

| Crane | Standard (as printed) | Max capacity | Max working jib | Minimum radius | Default jib | Capacity source |
| --- | --- | --- | --- | --- | --- | --- |
| Potain MCT 88 | EN 14439 C25 | 5 t | 52 m | n/a (idealised model) | 30 m (`INDICATIVE`) | Tip-load labels, datasheet p. 1 |
| Potain MCT 85 F5 | FEM 1.001-A3 | 5 t | 52 m | 2.7 m (printed) | 30 m (`INDICATIVE`) | Per-radius chart, datasheet p. 3 |

For both cranes, 53.1 m is the overall tip length, not a working jib configuration. The published
working configurations are 20, 25, 30, 35, 40, 45, 50 and 52 m.

## Capacity models

### MCT 88 — idealised tip-load model

For an installed jib length `L` and hook radius `r`, with published tip load `T(L)`:

- The installed jib must not exceed the published 52 m working maximum; 53.1 m is the overall tip
  length, not a jib configuration. `capacityAt` returns `null` above 52 m.
- Rated moment `M = T(L) × L`.
- Corner radius `r_c = M / maximum capacity`.
- `capacity(r) = maximum capacity` for `r <= r_c`.
- `capacity(r) = M / r` for `r_c < r <= L`.
- `capacity(r) = null` for `r > L`.

This two-piece curve is the Cycle 2 project idealisation, **not** a manufacturer equation. For the
MCT 88 with a 30 m jib it gives `M = 81 t·m`, `r_c = 16.2 m`, and `capacity(30 m) = 2.70 t`.

### MCT 85 F5 — published chart lookup

The MCT 85 F5 uses its own manufacturer chart, not the MCT 88 formula:

- The installed jib must be exactly one of the eight published configurations; otherwise the result
  is `INVALID`.
- The printed minimum hook radius is 2.7 m and is stored on every chart row. A radius below 2.7 m is
  `OUT_OF_RANGE`; the 5 t plateau does not extend below the published minimum.
- The base capacity is read from that jib's chart row. From 2.7 m to the first stored point the 5 t
  plateau applies; the first stored point is the end of the plateau, not the minimum radius.
- Between chart points, the capacity at the **next larger radius** is used (the lower bounding value).
  This cannot overstate the published capacity, though it may understate it between points.
- There is no extrapolation beyond the last published radius.
- The chart is the 5 t hook curve; the dashed 2.5 t-hook variant is not modelled.

For example, on the 30 m jib, 19 m returns 3.9 t (the 20 m point), not the linearly interpolated
4.48 t; 24 m returns 3.0 t (the 25 m point); 28 m returns 2.5 t (the 29 m point).

### Wind

The optional wind rule multiplies the base capacity by 0.8 at 20 km/h or above. It is labelled
`SIMULATED` in the code and UI and is not claimed to be EN 14439 Table 7 or a manufacturer rule. It is
applied once, after the crane-specific base capacity. A blank or `null` wind means no derate; a
negative or non-finite wind is `INVALID` with issue `invalid-wind` instead of being treated as calm.

## Sample picks

Both tables use the catalogue default 30 m jib.

**MCT 88**

| Pick | Load | Radius | Capacity | Utilisation | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.5 t | 20 m | 4.05 t | 61.7 % | PASS |
| 2 | 3.0 t | 25 m | 3.24 t | 92.6 % | PASS |
| 3 | 4.0 t | 30 m | 2.70 t | 148.1 % | FAIL |

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

- Only the two cranes above are catalogued. The Jaso J438PA.2R PDF was inspected but is not
  catalogued: it is a luffing-jib crane, its chart is imperial-only, it contains multiple TD/2R
  configurations with different capacities, and its packing list is not an erection sequence. See
  [`docs/SOURCES.md`](docs/SOURCES.md) §6.
- The 30 m default jib is `INDICATIVE` project configuration for both cranes, not a manufacturer
  recommendation.
- The model is not a structural, dynamic, reeving or ground-bearing check.
- The MCT 88 source documents disagree about the 30 m tip value (2.70 t label vs 2.54 t imperial
  conversion, and a 2.5 t point on the metric curve page). The load-curve page is also recorded as
  p. 3 in the Cycle 2 copy and p. 4 in the local reference copy; that page-number ambiguity is
  unresolved and is not guessed. The chosen value and the discrepancies are documented in
  [`docs/SOURCES.md`](docs/SOURCES.md) §3.
- The MCT 85 F5 p. 1 tip table labels 25 m as 3.0 t, while the p. 3 chart prints 3.02 t. The tip table
  keeps the p. 1 label; the capacity lookup uses the p. 3 point.
- `BACKLOG.md` refers to `docs/validation-calculation.txt`. No original was found in the working tree
  or Git history; [`docs/validation-calculation.txt`](docs/validation-calculation.txt) is a clearly
  labelled **reconstruction**, not the recovered original. See [`docs/SOURCES.md`](docs/SOURCES.md) §7.
- The MCT 85 F5 and Jaso PDFs do not state a redistribution licence. Confirm the manufacturer's terms
  before packaging or mirroring them. The PDFs are ignored by Git, and the production build copies
  only `manifest.json`, `icons/` and `dist/`, so they are not in `dist/plugins/tower-planner/`.
