# Frozen backlog (Cycle 4)

Frozen Thu 22 Oct 2026 from the brief plus your Step 0 ideation. Changes after this need a reason in the PR and DGOC sign-off. Deadline: deployed and demoed Fri 20 Nov.

Common rules for every MVP item: metres inside, x1000 at the Chili3D boundary; every number sourced or INDICATIVE; disclaimer "Planning aid, not a certified lift plan." on screen and in report; test with a hand-worked case in the comment; commits under own name. Sample site = `public/sample-site/`.

MVP cut order if late (applies to both teams): 1 travel-time heatmap and two-crane checks (stretch), 2 feasible-position sweep (stretch), 3 tower-erection scenario implementation (stretch), 4 tail-swing 3D ring (keep numeric radius), 5 tie-in level list, 6 PDF -> print-CSS/PNG. Never cut: capacity check, oversail/power-line check, min-distance check, pad reactions, units test, disclaimer.

### plugins/site-model (Ajit lead; everyone reviews)
| # | MVP item | Acceptance test | By |
|---|---|---|---|
| S1 | DXF import via dxf-parser (LINE, ARC, LWPOLYLINE, CIRCLE) into project JSON | `sample-site.dxf` loads; the 90 x 72 m plot boundary closes as a loop; NE corner is a true R10 arc (radians converted), area within 0.5 percent of the value computed by hand from the DXF | CI 1 |
| S2 | Units test | A known 40 m edge appears as 40,000 mm in the scene; the same data read back is 40.000 m | CI 1 |
| S3 | Buildings extruded to 3D solids from footprint + height | Tower A (25..65, 20..42, 75 m) gives a solid with volume 40 x 22 x 75 = 66,000 m^3 (before the podium) | CI 1 |
| S4 | Project JSON schema v1 (boundary, buildings+height, roads, power lines+clearance, no-go, neighbour rule `no_oversail`/`oversail_by_permission`, picks) with save/load round trip | Save then load returns identical data; both plugins read the same file; schema file in repo | CI 1 (schema), CI 2 (round trip) |
| S5 | PNG/PDF underlay with 2-point scale calibration | Click two points 40 m apart on the sample PNG; measured distance reads 40.0 m within 1 percent | CI 2 |
| S6 | Polygon draw/edit for building, road, power line (with clearance), no-go | Draw a 10 x 10 m rectangle; area 100 m^2; edit a vertex; undo works | CI 2 |
| S7 | Shared report helper (one format) used by both products | Both products produce a PDF/PNG with plan view, results table, sources, assumptions, disclaimer | CI 2 (skeleton), freeze for final |
| S8 | Tower to mobile hand-off JSON schema (component name, mass t, source, pick and set coordinates) | Schema file + one example validates; no code needed | CI 2 |

### plugins/tower-planner
| Owner | Item | Acceptance test | By |
|---|---|---|---|
| Anjali | T1 Catalogue JSON, MCT 88 first, then 1 to 2 more sourced, rest INDICATIVE; each field has source + page; includes heaviest erection component with mass | Validator fails if a field has neither a source nor INDICATIVE; MCT 88 passes (+/-10 percent) at 3 published per-radius points from Cycle 2 docs (confirm exact numbers from `docs/validation-calculation.txt`: M = 81 t.m, corner 16.2 m, so capacity at 25 m = 3.24 t, 5.0 t inside the corner) | CI 1 |
| Anjali | T2 `capacityAt` + pick engine ported with its tests | Pick list of 3 picks gives per-pick utilisation % and PASS/FAIL; "cranes passing every pick" returns the expected subset; a pick of load 4 t at 30 m on MCT 88 30 m jib = FAIL (cap 2.7 t) | CI 1 (engine + tests), CI 2 (UI) |
| Anjali | T3 Resolve MCT 88 tip-load discrepancy (2.54 t vs 2.70 t) | One line in SOURCES stating which is used and why | CI 1 |
| Puja | T4 Parametric crane solid from catalogue row (mast height, jib, counter-jib) in Chili3D | Change jib 30 to 40 m in data; solid length changes by 10 m (10,000 mm); crane visible on the sample site | CI 1 (basic solid), CI 2 (from catalogue) |
| Puja | T5 Port velocity-limited hoist/trolley/slew sim | Trolley from 10 m to 30 m at a stated limit takes distance / speed seconds (hand-computed), test passes | CI 2 |
| Namya | T6 Pure-TS clearance kernel (point-in-polygon, distance to segment/polygon, circle/annulus vs polygon) with tests; no Three/OCCT | The two sample cases: mast (30,40), R 40 m: oversails school by 2.0 m; power line violated by 7.0 m (46 needed vs 39); point on edge and outside cases | CI 1 |
| Namya | T7 Place/rotate crane, rings for min/max hook radius and counter-jib; 20 m base exclusion ring | Dragging the mast updates rings and the result panel without a calculate button; ring radius = catalogue value (m) | CI 1 (place + rings), CI 2 (live update) |
| Namya | T8 Oversail checks vs boundary, road, power line, neighbours (both rules), no-go | Same two sample cases appear as messages in the UI with metres: "Jib oversails the school by 2.0 m, no oversail permitted"; `oversail_by_permission` neighbour (nb_east) shows "permission needed" not "fail" | CI 2 |
| Namya | T9 Height check: hook height vs building + clearance, freestanding height, tie-in list | Tower A 75 m (podium 9 m): required hook height = 75 + clearance (source/INDICATIVE); crane with freestanding height below it returns "tie-in required" and a level list | CI 2 |
| whole team | T10 Report | PDF/PNG: plan, crane, pick table, failed checks, sources, assumptions, disclaimer | CI 2 (skeleton), freeze |
| Stretch order | (1) feasible-position grid sweep, (2) travel-time heatmap, (3) two-crane overlap, (4) weathervane envelope | | after MVP green |

### plugins/mobile-planner
| Owner | Item | Acceptance test | By |
|---|---|---|---|
| Rushikesh (lead) | M1 One `craneModel.js` KIT port + test suite; radius formula single-sourced; the crane named in the report is whatever KIT contains, with source | Radius uses `KIT.PIVOT_OFFSET_M` only (no other offset anywhere in the plugin); the 70 m boom / 30 m radius cell matches the cited PDF page and the test that checks it is green; UI and module give identical capacity for 3 hand-worked cases (no UI-only copies) | CI 1 |
| Rushikesh | M2 Lift input -> required radius/boom -> capacity, utilisation, worst point along swing | Pick (x1,y1) and set (x2,y2) with crane at (cx,cy): required radius = max of the two radii and the worst swing point is flagged; utilisation = (load + rigging)/capacity at that radius, hand-checked for one case | CI 2 |
| Sujal | M3 Outrigger footprint polygon on plan + pad reactions | Symmetric case: total weight W, 4 pads, load at centre = W/4 each; offset case matches a hand moment calculation; W and spread are user inputs, no invented crane numbers | CI 1 (reactions, tests), CI 2 (on plan) |
| Sujal | M4 Ground bearing vs user allowable + stability verdict | Pad pressure = reaction / pad area vs allowable gives PASS/FAIL; a case where one pad reaction goes negative returns "tipping" | CI 2 |
| Abhishek | M5 Distance dry run: box (building) and cylinder (boom) at 2.0 m, 0 m (touching), overlap, 0.5 m using `extremaDistance` / BRepExtrema through the TS API | Reports 2.00 m (+/-0.1 m), 0, collision flag, 0.50 m; documented how a plugin calls it | CI 1 (by Wed 28 Oct if the API is reachable; if not, report the exact blocker) |
| Abhishek | M6 Boom and load as solids at crane position/boom angle; min distance to every building and power line | Sample site: crane at a stated position and boom 20 m at stated angle: min distance to Tower A equals a hand-computed value (+/-0.1 m); red highlight under the clearance limit, with numeric readout | CI 2 |
| Abhishek | M7 Swing sweep: sample the slew every 2 to 5 degrees between pick and set; report the worst distance and the angle | Pick at 0 deg and set at 90 deg: worst-case angle and distance reported; changing step size changes the answer by less than the 10 cm tolerance | CI 2 |
| Ajit | M8 Site plugin (above) + crane placement UI with live radius + shared state wiring modules | Move the crane and capacity, pad loads and clearance all update; no stale value | CI 2 |
| Ajit | M9 Report (shared helper S7) | PDF with plan, verdict, pad loads, clearance, disclaimer | freeze |
| Stretch | Tower-erection scenario read from tower JSON (S8 schema), dismantling last-lift check | | after MVP green |

### Check-in 1 (Wed 28 Oct) exit bar
Site plugin loads the sample DXF and extrudes buildings (S1 to S4); MCT 88 catalogue + `capacityAt` tests green (T1, T2); clearance kernel tests green with the two sample cases (T6); crane solid and rings visible on the plan (T4, T7); mobile KIT port + tests green (M1); pad-reaction tests green (M3); Abhishek's distance dry-run result (M5). Every student has loaded a plugin in the browser (Namya, Ajit, Abhishek still to prove).

### Check-in 2 (Wed 4 Nov) exit bar
Full pick list pass/fail on tower; clearance live in UI on both products; boom-to-building distance live on sample site; ground bearing verdict; project JSON round trip; report skeleton; hand-off JSON schema fixed.
