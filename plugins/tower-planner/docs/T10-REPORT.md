# T10 report snapshot and Pick Check report (T10-1 to T10-3)

**Planning aid, not a certified lift plan.**

This document describes the report model added in T10-1. The model is an input
to the report/export work, not a report renderer by itself: T10-1 adds no
command, no HTML adapter, no plan SVG and no file export.

T10-2 adds the S7 `ReportData` adapter. T10-3 adds explicit Pick Check session
capture and the Tower Pick Report command, which sends the captured report
through S7's existing print window. Those additions are described below; they
do not add or change any capacity, T8 or T9 calculation.

A later additive amendment allows a truthful Pick Check-only report. Report
placement may omit slew, and T9 planned height parameters may be omitted when
T9 was not evaluated.

## Scope

T10-1 provides:

- `TowerPlanState` — a serializable description of everything the report needs.
- `buildTowerReportSnapshot(state)` — a pure, deterministic mapping from that
  state to a report-ready snapshot.
- Status, verdict and provenance mapping shared by every Tower report section.

The snapshot contains **already-evaluated** results. The builder does not read
the DOM, the active viewport or the system clock, does not recalculate capacity,
does not re-run T8 oversail or T9 height/tie-in checks, and never invents a
result for a check that is missing.

All lengths in `TowerPlanState` and `TowerReportSnapshot` are metres. The
millimetre conversion stays at the Chili3D scene boundary; the report introduces
no `×1000` step.

## Plan state

`TowerPlanState` holds:

| Field | Meaning |
| --- | --- |
| `metadata` | Project name, optional site location, fixed report date and author supplied by the caller |
| `site`, `siteProvenance` | Shared site model, or `null` when unavailable, plus its provenance |
| `crane`, `placement` | Selected sourced catalogue crane and report placement `(x, y, optional slew)` in metres/degrees |
| `jibM`, `windKmh` | Selected jib length (with provenance) and crane-level wind setting |
| `craneEvaluation` | Actual pick results and evaluation metadata (`craneId`, `craneName`, `jibM`, `windKmh`, `allPass`, `failedCount`) |
| `oversailReport` | Actual T8 report, or `null` when T8 did not run |
| `heightReport`, `heightParameters` | Actual T9 report (or `null` when T9 did not run) and, only when supplied, the four planned parameters used to produce it |
| `notes`, `assumptions` | Caller-supplied free text and report assumptions |

Pick results are widened to allow `UNSUPPORTED` for catalogue configurations the
current trolley-jib engine cannot evaluate. Existing `CraneEvaluation` values
remain assignable.

## Optional slew and height parameters (Pick Check amendment)

A Pick Check report does not evaluate slew and does not collect T9 height data.
It must still be able to report the real mast position without inventing those
values, so the report contract distinguishes an absent input from a checked
result:

- `TowerPlanPlacement` / `TowerReportPlacement` require mast `x` and `y`
  coordinates and accept a finite `slewAngleDeg` when one is supplied.
  `CranePlacement` remains unchanged and still requires slew for the Placement
  Panel; the report-specific type does not weaken that model.
- The snapshot copies slew only when the caller supplied a finite number. When
  it is absent, the adapter shows the "Slew angle" metric as a missing value
  with the note "Not evaluated: no slew angle was supplied for this report. No
  default or numeric value is inferred." It never renders `0°` or another
  substitute.
- `TowerPlanState.heightParameters` and
  `TowerReportSnapshot.heightParameters` are optional. When T9 was not
  evaluated, the caller omits them. The snapshot then omits its top-level
  `heightParameters`, does not clone or dereference any parameter, and does not
  add the four T9 parameter source entries ("Hook height (available)", "Hook
  clearance", "Freestanding height", "Tie-in spacing"). The adapter shows no
  planned-height metrics. The existing "No T9 height report was supplied."
  not-performed disclosure remains.
- A full report that supplies `heightReport` must continue to supply valid
  `heightParameters`. Existing callers and tests do so, and their output is
  unchanged.
- If a caller supplies `heightReport` without `heightParameters`, the T9
  results are preserved but no planned values are invented:
  `TowerReportHeight.parameters` and the top-level `heightParameters` are
  absent, no T9 source entries are generated, and the adapter adds an explicit
  "Planned height parameters" disclosure stating that planned-height values are
  not shown. The supplied T9 statuses and the overall verdict rules are not
  changed.
- `createDefaultHeightParameters()` is never used as a report fallback.

**"Not evaluated" is not a status.** It describes an input that was not
supplied, such as slew or the planned T9 parameters. It is deliberately distinct
from `PASS`, `FAIL` and `NOT_CHECKED`: no check row or status badge is created
for an absent slew. `NOT_CHECKED` remains reserved for a check that was not
performed, such as an absent T8/T9 section, an empty result set or an
unavailable T9 report.

That amendment did not add Pick Check capture, a report command, session storage
or WeakMaps. T10-3 adds capture and the report command below, and still adds no
T8/T9 calculation.

## T10-3: captured Pick Check report

T10-3 has two parts: an explicit capture step in Tower Pick Check (phase 1) and
a separate Tower Pick Report command (phase 2). Capture is never automatic, and
the report is never built from live dialog defaults.

### Session capture (phase 1)

- The Pick Check dialog's **Capture for report** button validates the current
  selected-crane draft and stores a copy for the active document.
- A draft is captured only when it has at least one pick, a finite jib length, a
  finite mast X/Y, a valid crane-level wind setting, finite supply/drop
  coordinates on every pick, and a selected-crane evaluation whose crane id,
  jib length and wind setting match the draft, whose pick count matches, and
  whose picks contain no `INVALID` result. `FAIL`, `OUT_OF_RANGE` and
  `UNSUPPORTED` are valid evaluated outcomes and may be captured.
- The stored session contains the selected crane, jib provenance, crane-level
  wind, mast position, picks and selected-crane evaluation. It does not contain
  the catalogue comparison matrix, slew, site geometry, T8 data or T9 data.
- Sessions are keyed by the `IDocument` object in a module-level `WeakMap`.
  Reads and writes return `structuredClone` copies, so callers cannot mutate the
  stored session. Clearing affects only the addressed document, and sessions are
  not persisted across a page reload.
- Jib provenance resolves to the exact catalogue default first, then an exact
  published `tipLoadByJib` row, then an exact published load-chart row. Any
  other entered length is `INDICATIVE` with the fixed basis "Project-selected
  jib length entered in Tower Pick Check; no catalogue row matched." It is never
  presented as a manufacturer value.

### Tower Pick Report command (phase 2)

The **Tower Pick Report** ribbon button (`tower.report`, Plugin tab next to
**Tower Pick Check**) requires an active document and a captured session for
that exact document. It never falls back to a default session, another
document's session or a fresh calculation.

1. With no active document, it shows a toast and opens no dialog. With no
   captured session for the active document, it shows a different toast and
   opens no dialog.
2. It opens a metadata dialog. Project is prefilled from the document name;
   author, date and optional site location are collected from the user. The
   dialog displays the exact planning-aid disclaimer and a summary of the
   captured crane, jib, pick count and wind setting.
3. Project, author and date are required. The date must be a real calendar date
   written `YYYY-MM-DD`. Text is trimmed and a blank optional site location is
   omitted. Invalid metadata is shown inline and keeps the dialog open; no
   report is generated.
4. Confirming builds the report through the pure path
   `buildTowerPickPlanState` → `buildTowerReportSnapshot` → `buildTowerReportData`.
   The captured crane, mast X/Y, jib, wind, picks and selected-crane evaluation
   are copied unchanged. The report does not read the dialog fields, recalculate
   capacity, or re-run T8/T9.
5. The plan state deliberately has `site: null`, no slew angle, no T8 oversail
   report, no T9 height report and no T9 height parameters. The snapshot
   therefore discloses those checks as not performed and the verdict is
   `INCOMPLETE`, never `PASS`.
6. The S7 adapter calls `validateReportData` before returning. If the report data
   cannot be built, the dialog stays open with an inline error and no window is
   opened.
7. Confirming also calls S7's existing `openReportPrintWindow(data)`. It adds no
   second HTML renderer and no PDF implementation. A blocked popup shows a toast
   saying no report was generated; a thrown print error shows the failure toast.
   Cancelling opens no window and leaves the captured session unchanged.

## Status mapping

| Tower result | Report status |
| --- | --- |
| `PASS` / `pass` | `PASS` |
| `FAIL` / `fail` | `FAIL` |
| `permission_needed` (T8) | `WARN` |
| `tie_in_required` (T9) | `WARN` |
| `unavailable` (T9) | `NOT_CHECKED` |
| `OUT_OF_RANGE` | `OUT_OF_RANGE` |
| `UNSUPPORTED` | `UNSUPPORTED` |
| `INVALID` | `INVALID` |
| missing / `null` / `undefined` | `NOT_CHECKED` |

A check that did not run or could not be evaluated is never rewritten to `PASS`
or `FAIL`. This follows the shared S7 report vocabulary (`MetricStatus`).
An absent slew angle or absent planned T9 parameter is not a check and therefore
does not become `NOT_CHECKED`; the [optional-field rules](#optional-slew-and-height-parameters-pick-check-amendment)
describe how it is disclosed instead.

## Overall verdict

Precedence, highest first:

1. `FAIL` — any failing pick, T8 or T9 result, including an overall-only fail.
2. `INCOMPLETE` — any `NOT_CHECKED`, `OUT_OF_RANGE`, `UNSUPPORTED`, `INVALID`
   or `INFO` result, an absent pick/T8/T9 section, an empty check set, an
   invalid T9 parameter set, a missing site, or contradictory evaluation
   metadata.
3. `WARN` — only permission/tie-in warnings remain.
4. `PASS` — every required check was evaluated and passed.

Every evaluated row participates in the verdict, not only each section's
overall status. A section marked overall `PASS` therefore cannot hide a
non-pass row.

### Site policy

**A report without a site can never be `PASS`.** This is a deliberate policy
decision. T8 oversail checks are relative to site geometry (boundary, roads,
neighbours, power lines and no-go zones); without a site the report cannot
verify those constraints. A `site: null` state therefore contributes
`NOT_CHECKED`, the snapshot records a "Site model" entry in `notChecked`, and
the overall verdict is at least `INCOMPLETE`. The initial T10-1 draft only
disclosed the missing site without changing the verdict; that behaviour was
changed here rather than left implicit.

### Evaluation metadata

The snapshot preserves `craneEvaluation.craneId`, `craneName`, `jibM`,
`windKmh`, `allPass` and `failedCount` in `snapshot.evaluation`. The builder
compares them with the displayed configuration and with the individual pick
statuses:

- evaluated crane id or name differs from `state.crane`;
- evaluated jib length or wind setting differs from `state.jibM.value` /
  `state.windKmh`;
- a pick row's `craneId`, `craneName` or `jibM` differs from `state.crane` or
  the evaluation metadata;
- a pick row's `windKmh` is neither `null` nor a finite non-negative number;
- `allPass` or `failedCount` contradicts the pick rows.

Any contradiction adds an `INVALID` "Pick evaluation metadata" check and forces
the verdict to at least `INCOMPLETE`. A genuine failed pick still wins with
`FAIL`, so contradictory metadata can never turn a failing lift into `PASS`.
The check is a consistency comparison only: no pick or capacity is
recalculated.

Per-pick wind overrides are supported by the pick engine. A valid override is
not treated as an error: the snapshot adds an operational assumption naming the
pick and its effective wind value (or the fact that the derate is disabled), so
it cannot be mistaken for the crane-level wind setting. A non-finite, negative
or otherwise invalid per-pick wind is `INVALID`.

### Empty T8/T9 result sets

A section with no result rows is never silently treated as a pass. Empty T8 or
T9 rows add a `NOT_CHECKED` disclosure, so an empty overall `PASS` report is
`INCOMPLETE`. An empty overall `FAIL` remains `FAIL` and is explained by a
synthetic `oversail-overall` / `height-overall` check. An empty overall
`permission_needed` or `tie_in_required` remains visible as `WARN` and also
produces `INCOMPLETE`, because no row supports the warning. The same synthetic
overall entry is added when a non-empty report claims a non-pass overall status
that none of its rows carries.

## Source mapping

| Provenance | Report status | Required evidence |
| --- | --- | --- |
| Catalogue `sourceId` resolving to a `SourceDocument` | `VERIFIED` | Non-empty document **and** positive-integer page |
| `indicative` `SourcedNumber` or `CraneDimension` | `INDICATIVE` | Non-blank basis/note text |
| Legacy/sample/demo site | `LEGACY` | Non-blank note describing the legacy or sample origin |
| Missing/unresolved/malformed provenance | `NOT_STATED` | Reason shown in the source entry |

A page is accepted only when it is a positive integer PDF page index. `0`,
negative values, fractional values, `NaN`, `Infinity`, blank strings, `"N/A"`,
`"unknown"` and arbitrary text are not pages; the source becomes `NOT_STATED`.
The same rule applies to catalogue sources, `CraneDimension` sources and site
provenance. See `src/catalogueValidator.ts` and `docs/SOURCES.md` for the same
catalogue convention.

A source id that is absent from the crane's source table, a source without a
document or positive-integer page, an empty INDICATIVE basis and an empty LEGACY
note are `NOT_STATED` — never `VERIFIED`. Missing nested provenance (for
example a `SourcedNumber` with no `provenance` or a `CraneDimension` with no
`source`) is guarded and returns `NOT_STATED` instead of throwing.

In particular:

- Default demo `CraneDimension` values from the placement panel are
  `INDICATIVE` and are never promoted to `VERIFIED`.
- Catalogue values such as maximum capacity and jib length resolve through the
  crane's own `sources` table.
- The four T9 parameter entries are generated only when the caller supplied
  `heightParameters`. A Pick Check report without T9 data adds none of them.
- If a wind setting is present, the `SIMULATED` wind-derate rule is added as an
  operational assumption so it cannot be mistaken for a certified wind load.

### Capacity basis

The `sources` table contains a dedicated "Capacity basis" entry resolved from
the exact catalogue row used for the selected jib:

- **Load-chart crane (for example MCT 85 F5 and MCT 88)** — the entry is
  resolved from the exact published point, or the exact bounding point pair,
  used at each supplied pick radius. It is not taken from `chart.points[0]`
  unconditionally. The note lists the published point(s) and the selected
  radius(es). MCT 85 F5 therefore cites `datasheetLoadCharts` page 3 and the
  MCT 88 cites `datasheetLoadCharts` page 4, not the crane overview on page 1.
  Both the `radiusM` and `capacityT` provenance of every used point must agree
  on one attribution; mixed, missing or unresolved point provenance makes the
  entry `NOT_STATED`.
- For a load-chart crane, only picks with a finite, non-null supplied
  `capacityT` contribute a radius. A pick with no published capacity is not
  described as having one; if no supplied pick has a finite capacity, the entry
  is `NOT_STATED`.
- **Tip-load-only crane (a model without `loadChart`)** — the entry is resolved
  from the published tip-load row for the selected jib, or from the two bounding
  rows when the selected jib is interpolated. The note records the Cycle 2
  tip-load idealisation (capacity derived from the published tip load and jib
  length, not a per-radius chart). The exact-row comparison deliberately matches
  the engine's boundary, so a jib slightly above a published row is described as
  an interpolation rather than an exact lookup.
- If no exact chart row exists, the jib is outside the published tip-load
  range, or the relevant bounding rows/points cannot be attributed to one
  resolved source, the entry is `NOT_STATED` with the reason. No page number or
  source document is invented.

A `NOT_STATED` capacity basis is a source-attribution limitation, not a new
check result: it does not by itself change the verdict, and the supplied pick
statuses remain authoritative. This is recorded as a remaining limitation
below.

## Disclosures and limitations

The snapshot always contains explicit `notChecked` entries for:

- **Pad reactions** — not implemented in the Tower Planner; no foundation or pad
  reaction check is performed by this report.
- **General 3D minimum distance** — not implemented; T8 covers horizontal
  oversail and T9 covers height/tie-in only. Neither substitutes for a general
  3D clearance check.

These two disclosures do not by themselves change the verdict, so an all-pass
set of *evaluated* checks can report `PASS` while the report still states what
was not checked. Missing site geometry, missing picks, a missing T8 report and a
missing/unavailable T9 report do force `INCOMPLETE`.

Additional limitations:

- The snapshot carries `TowerPlanMetadata` (project name, optional site
  location, date, author). The T10-2 adapter adds S7's required `title` and
  `product` fields and calls S7's `validateReportData` before returning, so a
  blank project/author or a date that is not a real `YYYY-MM-DD` calendar date
  is rejected before `ReportData` leaves the adapter.
- `snapshot.verdict` is a `VerdictStatus`, not S7's `ReportVerdict`; the adapter
  adds a title and summary.
- The snapshot has no `sections` array. The adapter must build S7 metrics/tables
  from `picks`, `oversail`, `height`, `failedChecks` and `notChecked`.
- `TowerReportSource` is not structurally S7's `ReportSource` because
  `document` is optional for `INDICATIVE`/`NOT_STATED` entries and `basis`/`note`
  have no S7 source field; the adapter splits resolved sources from assumptions
  and preserves the capacity-basis notes, which carry the per-radius/tip-load
  disclosures.
- `snapshot.notes` is passed through to S7 `ReportData.notes` unchanged; S7
  prints it in its Notes section.
- The site/T8 `source` strings (`OversailBoundary.source`,
  `OversailCheckResult.source`, `OversailRoad.source`,
  `OversailPowerLine.sourceNote`) are not consolidated into `snapshot.sources`.
  The adapter must map them explicitly or the attribution is lost.
- `evaluation`, `failedChecks`, `notChecked`, `picks`, `oversail`, `height`,
  `crane`, `placement` and the optional `heightParameters` are snapshot-specific
  and must be mapped deliberately; `notChecked` (pad reactions, general 3D
  distance, missing sections) must be rendered so a `PASS` is not presented as a
  fully checked result.
- The snapshot does not render a plan view or SVG.
- Pick coordinates and unsupported luffing-jib handling depend on work landing
  separately; this snapshot preserves whatever status the evaluation supplies.
- A `NOT_STATED` capacity basis is disclosed but does not gate the verdict, as
  described above.
- A `NOT_STATED` site, crane or height provenance is likewise disclosed in the
  `sources` table but does not by itself gate the verdict. Missing provenance
  is a source-attribution limitation, not a check result. Verdict gating
  follows the complete rules in [Overall verdict](#overall-verdict), including
  non-pass pick/T8/T9 statuses, missing picks and empty or absent sections;
  source attribution is shown for the reader.
- Supplied pick arithmetic is trusted. The builder checks the evaluation
  metadata and counters, but does not independently verify that
  `loadT <= capacityT` or that `utilisationPct <= 100`. The engine produces
  those statuses; the report must not recalculate capacity. The adapter and UI
  must treat `snapshot.verdict` and `snapshot.failedChecks` as authoritative
  and must not derive a pass badge from `snapshot.evaluation.allPass` alone.
- When a caller omits provenance, the cloned crane/height values preserve the
  absence rather than inventing an `INDICATIVE` label. The authoritative
  `sources` table reports that value as `NOT_STATED`; consumers should read the
  table rather than infer provenance from a cloned field.
- T10-3 supplies no slew, site geometry, T8 report or T9 report/parameters. A
  Pick Check report therefore always discloses those checks as not performed and
  its verdict is `INCOMPLETE`; it is not a substitute for a report that includes
  a site and the T8/T9 results.
- Pick Check sessions are memory-only and scoped to one `IDocument`. They are
  lost on reload, are not saved with the document, and cannot be read by a
  different document. Report metadata is not stored in the session or document.
- The report command uses the captured session values, not the dialog's current
  values. Editing the current Pick Check after capture does not change an
  existing report until **Capture for report** is clicked again.
- T10-3 prints through S7's browser print window only. It does not write a PDF
  or an HTML file, so the browser must allow the popup and the user must choose
  a printer or PDF destination from the print dialog.
- Statuses and the verdict are report vocabulary only; they are not a
  certification and do not replace engineering review.

## Determinism and copy isolation

`buildTowerReportSnapshot` copies caller-supplied date and author, so two calls
with the same state produce the same snapshot on any day. Arrays are rebuilt in
input order.

The snapshot is an isolated artifact rather than a view over caller-owned
memory. Nested site polygons and surrounding objects, catalogue source records,
tip-load rows, load-chart points and provenance, supplied height
results/errors/tie-in levels/parameters, evaluation counters, assumptions and
notes are all copied. Mutating the input state after the snapshot is built does
not change the snapshot, and mutating the snapshot does not change the input.

Focused tests live in `plugins/tower-planner/test/towerReportSnapshot.test.ts`
and cover the status table and verdict precedence (including `OUT_OF_RANGE`,
`UNSUPPORTED`, `INVALID`, `WARN`, `NOT_CHECKED` and `INFO`), mixed
PASS/non-PASS picks, empty and missing T8/T9 sections, overall-only T8/T9
states, evaluation metadata contradictions, per-pick metadata and wind
overrides, positive-integer page validation, blank INDICATIVE/LEGACY evidence,
malformed provenance, containers and boundary geometry, capacity source mapping
for MCT 85 F5 and MCT 88, exact chart-point usage, null-capacity pick exclusion
and mixed point provenance, NotStated catalogue dimension and
heaviest-component preservation, interpolation,
determinism and copy isolation.
`plugins/tower-planner/test/towerReportAdapter.test.ts` covers the T10-2 S7
adapter. The additive optional-field contract is covered separately in
`plugins/tower-planner/test/towerReportOptionalContract.test.ts`: finite mast
X/Y with absent slew, no fabricated numeric slew, absent T9 parameters with no
T9 report, no planned-height metrics or T9 source entries, the retained T9
not-performed disclosure, unchanged full-report output, and a present T9 report
with absent parameters.

T10-3 phase 1 is covered by `plugins/tower-planner/test/towerPickSession.test.ts`
and `plugins/tower-planner/test/pickSessionDialog.test.ts`: capture validation,
rejection of invalid drafts, per-document isolation, clone isolation, clear
semantics, jib-provenance precedence and the dialog's capture status. T10-3
phase 2 is covered by `plugins/tower-planner/test/towerPickReport.test.ts` and
`plugins/tower-planner/test/towerPickReportCommand.test.ts`: metadata validation
(including real leap dates), missing document/session guards, document-specific
session lookup, copied-not-recalculated capacities, absent slew/site/T8/T9
disclosures, the `INCOMPLETE` verdict, S7 validation and printed metadata, the
exact disclaimer, popup-blocked and success paths, invalid report data and
cancellation without changing the captured session.

The snapshot tests retain the hand-worked T8 power-line case:

- Mast `(30, 40)`, power line `x = -9`, swing radius `40 m`, clearance `6 m`.
- Available distance = `30 + 9 = 39 m`.
- Required distance = `40 + 6 = 46 m`.
- Shortfall = `46 - 39 = 7.0 m`, so the check is `FAIL` and remains visible in
  the snapshot and failed-check list.
