# Tower Planner Plugin

Tower crane planning aid for Cycle 4.

## T6 clearance kernel

Pure TypeScript helpers in `src/geometry/clearance.ts` for sample-site clearance checks. The kernel covers point-in-polygon, distances, a swing circle versus polygon, and `checkAnnulusPolygonIntersection` for a radial band (inner/outer radius) versus polygon, including edges that cross the band and polygons that enclose it. See `test/clearance.test.ts` for worked examples.

## T7 placement and rings

`Place Tower Crane` opens a live float panel and draws:

- maximum hook-radius ring (solid orange)
- minimum hook-radius ring (dashed green)
- counter-jib sweep ring (dashed blue)
- fixed 20 m base-exclusion ring (dashed grey)
- jib, counter-jib and mast marker

Drag the mast marker in the viewport, type mast coordinates, or move the slew slider. Every change updates the rings and result panel immediately; there is no Calculate button.

All catalogue dimensions are placeholders marked `INDICATIVE`. They are not sourced crane data. Replace them from the applicable load chart and cite the document and page before using the result.

## T8 oversail checks

The placement panel recalculates clearance checks on every valid change and shows each result as `PASS`, `FAIL` or `PERMISSION NEEDED`, plus an overall status:

- **Site boundary** — a jib envelope outside the plot is reported as a fail because no boundary oversail rule was supplied; this is a planning constraint, not a quoted standard.
- **Road** — modelled as a horizontal band between `yFromM` and `yToM`, infinite in X.
- **Overhead power line** — modelled as a vertical line at `xM`, infinite in Y. Required distance is jib radius plus clearance. The sample 6 m clearance is labelled `INDICATIVE`.
- **Neighbours** — only buildings named in `no_oversail` or `oversail_by_permission` are checked. Overflying a `no_oversail` neighbour fails; a permission neighbour returns `PERMISSION NEEDED`.
- **No-go zones** — circular exclusion zones; any overlap with the jib envelope fails.

The check covers the jib/full hook envelope only, not the counter-jib. Supply zones (`S1` rebar yard, `S2` formwork store, `S3` concrete pump) are not treated as obstacles. Proposed buildings are not treated as neighbours unless they are explicitly named in the neighbour rule arrays.

`src/model/siteSnapshot.ts` adapts the shared v1 site format and the legacy sample file into an `OversailSite`. The legacy sample has no boundary vertex list; the panel then shows `Site data unavailable...` and does not report a boundary result. Boundary geometry is never approximated from plot width/depth.

**Planning aid, not a certified lift plan.**
