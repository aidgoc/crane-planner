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

**Planning aid, not a certified lift plan.**
