# Sources, assumptions and capacity provenance

> **Planning aid, not a certified lift plan.**

This file records where every catalogue number came from and how each crane's capacity is evaluated.
It distinguishes manufacturer-stated values from application calculations and records source
ambiguities instead of quietly choosing one value.

## 1. Page-reference convention

None of the three source PDFs has printed page numbers. All page references in the catalogue and this
document are **PDF page indices**, 1-based, in the order a PDF viewer opens the document. If a printed
page number is found later, record it alongside the PDF index.

## 2. Documents inspected

| Crane | Document | Pages | What it supplies |
| --- | --- | --- | --- |
| Potain MCT 88 | Potain MCT 88 Data Sheet, FEM 1.001-A3 (Manitowoc, Code 09-003-.5M-0610), 8-page PDF at `plugins/tower-planner/docs/02D_FEM1001mt_MCT88_2006_40-21.pdf` | pp. 1, 2, 4, 6; local load curves p. 4 (Cycle 2 mirrored copy recorded p. 3, unresolved) | 5 t maximum, 52 m maximum working jib (53.1 m overall tip length), p. 4 upper 5 t hook load chart (8 jib lengths, 86 points) and lower 3 t hook table, p. 1 summary labels, p. 2 P12D height under hook and ZC 2030 base width, dimensions and component weights |
| Potain MCT 85 F5 | Potain MCT 85 F5 Data Sheet, FEM 1.001-A3 (Manitowoc, Ref. `02D_FEM1001mt_MCT85F5_2026_05-0`), copyright 2026 Manitowoc, 8 pages | pp. 1, 2, 3, 5 | 5 t maximum, 52 m maximum working jib, per-radius load curves for 8 jib lengths, p. 2 P12D height under hook and ZF 12A base width, counter-jib dimensions and masses |
| Jaso J438PA.2R | Jaso J438PA.2R tower-crane brochure, EN 14439 C25 / FEM 1005-C25, dated 30/05/2025 (PDF metadata title `HT212.01.1.01`), 7 pages | pp. 1, 2, 6 (packing list continues on p. 7) | Luffing-jib configurations, H height without fastening, imperial TD/2R load charts, transport packing list |

The MCT 85 F5 PDF has no title metadata and no printed page numbers; its description above comes
from the model and standard printed on every page and from the file reference. The Jaso PDF's title
metadata is `HT212.01.1.01`, but the document is referred to by its model name here.

The MCT 88 PDF is present in this working tree at
`plugins/tower-planner/docs/02D_FEM1001mt_MCT88_2006_40-21.pdf` but is **ignored by Git and untracked**
(`.gitignore` excludes `plugins/tower-planner/docs/*.pdf`). The e-catalogue URL stored in the JSON is
<https://www.manitowoc.com/potain-ecatalog-en14439-c25d25.html>; the load-chart values were read from
the PDF copy because the e-catalogue blocks automated access. The e-catalogue identifies
**EN 14439 C25**, while the PDF prints **FEM 1.001-A3**; §3.1 records the distinction. The MCT 88,
MCT 85 F5 and Jaso PDFs are all in `plugins/tower-planner/docs/`.

### PDF checksums

The three PDFs present in the working tree have these SHA-256 checksums:

| File | SHA-256 |
| --- | --- |
| `02D_FEM1001mt_MCT88_2006_40-21.pdf` | `0B7A7DFFCC7BB8B5DD54BA69120D1828DF80F0C6FD7EAD7AC0D505EFB0F7B82F` |
| `02D_FEM1001mt_MCT85F5_2026_05-0.pdf` | `601E6A186BCFD230D2D684689610F74BF9A6E717D6A7DD0ABE3807AC02A1E51C` |
| `J438PA.2R_EN-14439-C25_LB-FT_HT21201101.pdf` | `894B918E32A36C2CEC57902E3FE38406CD51B793521DBFF741284D31C574C2B5` |

The MCT 88 PDF is ignored by Git and untracked, not absent: it is present at the path above. Its
checksum identifies the copy that was read; it does not grant redistribution permission, and the PDF
must stay out of Git.

### Licensing note

The MCT 85 F5 PDF states that it is a commercial document and is not legally binding. No
redistribution licence was verified from the MCT 88, MCT 85 F5 or Jaso PDFs. Their presence in this
working tree does not establish a right to redistribute them in a published plugin package. Confirm
the manufacturer's terms before packaging or mirroring the PDFs; do not add further copies until that
is resolved.

The production build copies only the plugin's `manifest.json`, `icons/` and `dist/` into
`dist/plugins/tower-planner/`; it does not copy `docs/`, so the PDFs are not in the distributable.
`scripts/build-plugins.mjs` also scans the copied plugin directory and fails the build if any PDF is
present. The plugin's `npm run package` script likewise packages only `manifest.json`, `icons/` and
`dist/`. `.gitignore` excludes `plugins/tower-planner/docs/*.pdf`, and a test checks that no PDF under
the plugin is tracked. No source URL is recorded here for the MCT 85 F5 or Jaso documents because none
was verified from the documents themselves.

## 3. Potain MCT 88

### 3.1 Catalogue values

| Field | Value | Provenance |
| --- | --- | --- |
| Catalogue standard | EN 14439 C25 | e-catalogue URL; the inspected PDF prints FEM 1.001-A3 on all 8 pages, not EN 14439 C25 |
| Maximum capacity | 5 t | datasheet p. 1 |
| Maximum working jib | 52 m | datasheet p. 1; confirmed by the p. 4 curves and p. 5 jib-weight table, which both stop at 52 m |
| Overall tip length | 53.1 m | datasheet p. 1 drawing; **not** a working jib configuration |
| Default jib | 30 m | **INDICATIVE** — Cycle 2 project configuration, not a manufacturer recommendation |
| Mast width | 1.2 m × 1.2 m | datasheet p. 1 overview drawing; mast sections p. 7 also state 1.2 m |
| Base width | 3.8 m | datasheet p. 2, ZC 2030 table; the P12D table states no base width |
| Height under hook (`Ho`) | 43.1 m | datasheet p. 2, P12D table; the ZC 2030 and ZD 2030 tables give 41.5 m; this is **not** a freestanding-height limit |
| Freestanding height | not stated | the inspected datasheet does not label a freestanding height; no value is inferred from `Ho` |
| Counter-jib length | 11.9 m (variants A and B) | datasheet p. 6 |
| Counter-jib radius | 13.7 m (variant A); 11.3 m (variant B) | datasheet p. 1 drawing; a different dimension from the p. 6 structural length |
| Counter-jib mass | 4.38 t (variant A); 4.25 t (variant B) | datasheet p. 6 |
| Cab mass | 1.10 t | datasheet p. 6 |

**Standard attribution.** The catalogue `standard` field is **EN 14439 C25**, associated with the
e-catalogue URL `potain-ecatalog-en14439-c25d25.html`. The inspected 8-page reference PDF is titled
`Potain MCT 88 Data Sheet, FEM 1.001-A3 ...` and prints **FEM 1.001-A3** on all eight pages; it does
not print EN 14439 C25. Both source statements are recorded separately and are **not** claimed to be
equivalent. Which standard the `standard` field should represent remains pending mentor confirmation;
the field value is unchanged.

The p. 2 P12D table labels **43.1 m** as a height under hook. It is stored in `heightUnderHookM` with
that meaning. It is **not** a freestanding-height limit, and `freestandingHeightM` is `notStated`
because the inspected datasheet does not publish one. Do not use the height under hook as a
freestanding height in planning.

The same p. 2 prints ZC 2030 (height under hook **41.5 m**, base width **3.8 m**) and ZD 2030 (height
under hook **41.5 m**, base width **4.5 m**) tables; the P12D table states no base width. The
catalogue stores the **3.8 m** base width from ZC 2030 alongside the **43.1 m** height from P12D. That
P12D-height / ZC 2030-base-width combination is unresolved and requires mentor confirmation; neither
stored value is changed here.

Tip-load table (jib length → published tip load) from the upper 5 t hook table on datasheet p. 4:
20 m → 3.95 t, 25 m → 3.00 t, 30 m → 2.50 t, 35 m → 2.22 t, 40 m → 1.90 t, 45 m → 1.65 t,
50 m → 1.40 t, 52 m → 1.10 t. The p. 1 summary labels do not all equal this table (for example,
30 m: 2.70 t on p. 1 vs 2.50 t in the p. 4 upper table; 52 m: 1.15 t vs 1.10 t). The catalogue uses
the p. 4 upper table for every jib configuration. The previous 53.1 m row was the overall tip length,
not a published jib configuration, and has been corrected to 52 m.

The reference copy was re-read for the Cycle 4 review. Three points resolve the earlier ambiguity:

- p. 1 draws the working jib at **52 m** with a **1.15 t** tip load and separately labels the
  **53.1 m** overall tip. The p. 4 load curves and p. 5 jib-weight table both stop at 52 m.
- p. 6 lists the counter-jib structural length as **11.9 m for both variants A and B**, with
  **4380 kg** for A and **4250 kg** for B. The p. 1 drawing's **13.7 m (A) / 11.3 m (B)** label is a
  counter-jib radius, a different dimension; it is not substituted for the p. 6 length.
- p. 1 shows the **1.2 m × 1.2 m** mast, and p. 7 lists 1.2 m mast sections. The value is unchanged;
  the catalogue's mast-width provenance was corrected from p. 6 to p. 1.

The MCT 85 F5 must remain separate: its p. 5 table pairs 11.9 m with 4.25 t (variant B) and 14.6 m
with 4.38 t (variant A). The MCT 88 entry's 11.9 m / 4.38 t pairing comes from the MCT 88 p. 6 table,
not from the MCT 85 F5 table, and the two cranes' variant pairings must not be mixed.

The `heaviestErectionComponent` value is 4.38 t (counter-jib, variant A). The p. 6 table is a
component-weight table, not an erection-sequence plan; the actual heaviest lift and its radius must
be confirmed against the erection manual before use.

### 3.2 Capacity method — published chart, conservative lookup

The MCT 88 capacity is read from the **upper 5 t hook load chart on datasheet p. 4**, not calculated by
the old Cycle 2 inverse-radius formula. The chart has 8 jib rows (20, 25, 30, 35, 40, 45, 50 and 52 m)
and 86 published points. For an MCT 88 pick:

1. The installed jib must be exactly one of those eight published configurations. For an unsupported
   jib, `capacityAt` returns `null`; the pick layer reports `INVALID` with issue
   `jib-outside-published-range`.
2. The hook radius must be positive, at least the printed **2.7 m** minimum, and no greater than the
   installed jib. A radius below 2.7 m or above the jib is `OUT_OF_RANGE`.
3. The base capacity is read from the chart row for that exact jib. From 2.7 m to the first listed
   radius the 5 t plateau applies; the first listed radius is the end of the plateau, not the minimum
   radius. Between published points the capacity at the next larger radius is used; there is no
   interpolation. Beyond the last published point there is no value and `capacityAt` returns `null`;
   there is no extrapolation.
4. The optional wind factor is applied once to the chart capacity. The wind rule is `SIMULATED`
   (see §5).

Representative chart values and step lookups:

| Jib | Requested radius | Returned capacity | Basis |
| --- | --- | --- | --- |
| 20 m | 20 m | 3.95 t | last published point |
| 25 m | 20 m | 3.90 t | published point |
| 25 m | 25 m | 3.00 t | last published point |
| 30 m | 28 m | 2.50 t | next larger point is 29 m |
| 35 m | 31 m | 2.50 t | next larger point is 31.6 m |
| 35 m | 31.7 m | 2.45 t | next larger point is 32 m |
| 52 m | 28.43 m | 2.15 t | next larger point is 30 m |
| 52 m | 39.20 m | 1.55 t | next larger point is 40 m |
| 52 m | 47.20 m | 1.15 t | next larger point is 50 m |
| 52 m | 52 m | 1.10 t | last published point |

These are the numbers used by `capacityAt`; the worked calculation is in
[`validation-calculation.txt`](validation-calculation.txt). The runtime capacity is selected from this
chart; it is **not** calculated by an inverse-radius formula.

### 3.3 T3 — resolution of the old 2.70 t vs 2.54 t question

The original T3 comparison asked whether the MCT 88 30 m tip value should be the p. 1 label **2.70 t**
or the imperial conversion **2.54 t** from the Cycle 2 notes. That comparison is superseded by the
p. 4 load chart:

- The p. 4 upper 5 t hook table gives **2.50 t** at the 30 m jib tip.
- The lower p. 4 3 t hook table gives **2.70 t** at the 30 m tip.
- The p. 1 summary also labels 30 m at **2.70 t**.

The catalogue now uses the upper **5 t** hook table for all eight jib configurations, so the MCT 88
30 m capacity is **2.50 t**, not 2.70 t or 2.54 t. The 2.54 t imperial conversion and the 2.70 t
label are retained only as historical source notes; they are not capacity-model inputs. This resolves
the original T3 question by choosing the published 5 t chart rather than either of the two earlier
values.

### 3.4 Metric load-curve page: two hook tables

The local PDF's metric load-curve page is **p. 4** and contains two separate tables:

- The **upper table is the 5 t hook chart**. Its rows include 20 m: 16.3 m → 5 t, 17 m → 4.8 t,
  20 m → 3.95 t; 30 m: 16.3 m → 5 t through 30 m → 2.5 t; 52 m: 13.7 m → 5 t through 52 m → 1.1 t.
- The **lower table is the 3 t hook chart**. It has different capacities and radii, e.g. 20 m:
  20 m → 3 t; 30 m: 27.4 m → 3 t, 30 m → 2.7 t; 52 m: 22.9 m → 3 t through 52 m → 1.15 t.

The catalogue uses the **upper 5 t hook table for all eight supported jib configurations**. The lower
3 t table is documented for source completeness and is **not** used for MCT 88 capacity or tip-load
values. Do not mix points from the two tables.

A dashed variant annotation on the page reads `-0.245 t`. The source does not establish that it is a
general deduction from every chart value; it is recorded but not modelled and is not subtracted from
the rated capacities.

The page number is also ambiguous between copies. The local 8-page PDF places the metric load curves
on **p. 4**, and `datasheetLoadCharts.page` records **4**. The Cycle 2 mirrored copy records the
load-curve page as **p. 3**; that number remains unverified against the local copy and is not used.
The `datasheetLoadCharts` source is now referenced by the MCT 88 `tipLoadByJib` values and load chart,
not retained only for a separate comparison.

## 4. Potain MCT 85 F5

### 4.1 Identity and configurations

- Exact model: **Potain MCT 85 F5**, hammerhead tower crane with a trolley jib.
- Standard printed on every page: **FEM 1.001-A3**. This is not claimed to be EN 14439 C25.
- Maximum capacity: **5 t** (p. 1).
- Maximum working jib: **52 m** (p. 1). The drawing also shows **53.1 m**, which is the overall tip
  length, not a working jib configuration.
- Published jib configurations: **20, 25, 30, 35, 40, 45, 50 and 52 m** (p. 3).
- Default jib: **30 m**, marked **INDICATIVE** because the choice is a project configuration. 30 m is
  a published configuration (2.5 t tip load) and is not a manufacturer recommendation.

### 4.2 Verified load-chart points

All values below are printed on p. 3 and stored with per-field provenance in
`data/crane-catalogue.json`. The full chart has 8 rows and 86 points; this table is a compact extract,
not the complete data set.

| Jib | First radius → capacity | Other verified points | Tip radius → capacity |
| --- | --- | --- | --- |
| 20 m | 16.3 m → 5 t | 17 m → 4.8 t | 20 m → 3.95 t |
| 25 m | 16.3 m → 5 t | 17 m → 4.8 t; 20 m → 3.9 t; 22 m → 3.5 t | 25 m → 3.02 t |
| 30 m | 16.3 m → 5 t | 20 m → 3.9 t; 22 m → 3.5 t; 25 m → 3.0 t; 27 m → 2.75 t; 29 m → 2.5 t | 30 m → 2.5 t |
| 35 m | 16.4 m → 5 t | 20 m → 3.9 t; 29.1 m → 2.5 t; 31.6 m → 2.5 t; 32 m → 2.45 t | 35 m → 2.22 t |
| 40 m | 16.4 m → 5 t | 25 m → 3.0 t; 32 m → 2.45 t; 35 m → 2.2 t; 37 m → 2.1 t | 40 m → 1.9 t |
| 45 m | 16.3 m → 5 t | 25 m → 3.0 t; 32 m → 2.45 t; 40 m → 1.9 t; 42 m → 1.8 t | 45 m → 1.65 t |
| 50 m | 15.9 m → 5 t | 17 m → 4.6 t; 28.3 m → 2.5 t; 30.7 m → 2.5 t; 47 m → 1.5 t | 50 m → 1.4 t |
| 52 m | 13.7 m → 5 t | 15 m → 4.5 t; 24.3 m → 2.5 t; 26.4 m → 2.5 t; 50 m → 1.15 t | 52 m → 1.1 t |

Source notes and ambiguities:

- The printed minimum radius is **2.7 m**. It is stored as `minRadiusM` on every chart row with the
  p. 3 provenance. The first listed radius for each jib is the end of the constant 5 t plateau, not
  the minimum radius. A requested radius below 2.7 m is `OUT_OF_RANGE`; the engine does not return
  the 5 t plateau there.
- The p. 1 tip table and p. 3 chart differ at 25 m: p. 1 labels **3.0 t**, while p. 3 prints
  **3.02 t**. The tip-load table keeps the p. 1 label; the capacity lookup uses the p. 3 chart point.
  The 0.02 t difference is a source rounding difference, not a modelling choice.
- The chart is the **5 t hook curve**. A dashed variant annotation reads `-0.245 t`; the source does
  not establish it as a general deduction, and it is **not modelled**.
- The MCT 88 p. 4 upper 5 t chart is numerically identical to the MCT 85 F5 p. 3 chart except at the
  25 m jib endpoint: MCT 88 **3.00 t**, MCT 85 F5 **3.02 t**. The cranes still use separate source
  pages and separate dimensions; do not copy the MCT 88 p. 1 summary or component table onto the
  MCT 85 F5.
- No interpolation is added between published radii. Between two points the engine uses the capacity
  at the next larger radius (the lower bounding value). For example, on the 30 m jib:
  - 19 m lies between 17 m (4.8 t) and 20 m (3.9 t); the engine returns **3.9 t**, not the linearly
    interpolated 4.48 t.
  - 24 m lies between 22 m (3.5 t) and 25 m (3.0 t); the engine returns **3.0 t**.
  - 28 m lies between 27 m (2.75 t) and 29 m (2.5 t); the engine returns **2.5 t**.
- There is no extrapolation beyond the last published radius and no chart for an unpublished jib
  length. A requested jib such as 32.5 m is **INVALID**, even though it lies between the 30 m and
  35 m configurations.

### 4.3 Dimensions and heaviest erection component

| Field | Value | Provenance |
| --- | --- | --- |
| Mast width | 1.2 m | p. 1 |
| Base width | 3.8 m | p. 2, ZF 12A drawing; the P12D table states no base width |
| Height under hook (`Ho`) | 41.6 m for 20-40 m jibs; 40.1 m for 45-52 m | p. 2, P12D mast table; the 30 m default jib uses 41.6 m; **not** a freestanding height |
| Freestanding height | not stated | the inspected datasheet does not label a freestanding height; no value is inferred from `Ho` |
| Counter-jib length | 14.6 m (variant A); 11.9 m (variant B) | p. 5 |
| Counter-jib radius | 13.7 m (variant A); 11.3 m (variant B) | p. 1 drawing; a different dimension from the p. 5 structural length |
| Counter-jib mass | 4.38 t (variant A); 4.25 t (variant B) | p. 5 |
| Heaviest listed component | Counter-jib variant A, 4.38 t | p. 5 |

The p. 2 **3.8 m** base width is labelled on the **ZF 12A** drawing. The P12D table supplies the height
under hook but states no base width, so the base-width provenance is ZF 12A, not P12D.

The catalogue uses variant A (the longer, heavier counter-jib) for both the counter-jib length and the
`heaviestErectionComponent` mass. The p. 5 table is a **component-weight table, not an erection
sequence**. It does not state the lift radius, rigging, or assembly order. Confirm the actual heaviest
lift against the manufacturer's erection manual before use.

The p. 1 drawing labels the counter-jib radius as **13.7 m (A) / 11.3 m (B)**. That is a different
dimension from the p. 5 structural length (14.6 m / 11.9 m); the catalogue uses the p. 5 length and
does not substitute the drawing radius.

### 4.4 Capacity method — manufacturer chart, conservative lookup

For an MCT 85 F5 pick:

1. The installed jib must be exactly one of the eight published configurations. Otherwise the result
   is `INVALID` with issue `jib-outside-published-range`.
2. The hook radius must be positive, at least the printed **2.7 m** minimum, and no greater than the
   installed jib. A radius below 2.7 m or above the jib is `OUT_OF_RANGE`.
3. The base capacity is read from the published chart row for that exact jib. From 2.7 m to the first
   published radius the 5 t plateau applies; between points the next larger radius's capacity is
   used; beyond the last point there is no value.
4. The optional wind factor is applied once to the chart capacity. The wind rule is `SIMULATED`
   (see §5).

This is a manufacturer-chart lookup with the same conservative step and no-extrapolation rules used
for the MCT 88. The two charts are numerically identical except at the 25 m jib endpoint (3.00 t for
MCT 88, 3.02 t for MCT 85 F5). The cranes still have separate dimensions and source pages; do not mix
their p. 1 tip tables or component-weight tables.

## 5. Wind rule — SIMULATED, not a manufacturer rule

`capacityAt` accepts an optional wind speed. At 20 km/h or above it multiplies the base capacity by
0.8 exactly once; below 20 km/h, or with `null`/`undefined` wind, it returns the base capacity. A
negative or non-finite wind is invalid: `capacityAt` returns `null`, and `evaluatePick` reports
`INVALID` with issue `invalid-wind`. Out-of-range radius still returns `null`.

This comes from a product request that described the factor as "per EN 14439 Table 7". The project
sources do not contain that table, the 0.8 factor or the 20 km/h threshold. The rule is therefore
implemented and displayed as **SIMULATED**. It is not a certified wind-load calculation and is not
claimed to be validated against a manufacturer wind chart. It applies after the crane-specific base
capacity, so it does not alter any published chart value.

## 6. Jaso J438PA.2R — two INDICATIVE luffing-jib configurations

The Jaso J438PA.2R is catalogued as **two configurations of one model**, not as two crane models:

| Catalogue id | Model id | Configuration | Type |
| --- | --- | --- | --- |
| `jaso-j438pa-2r-td-213` | `jaso-j438pa-2r` | 213 ft TD | `luffing-jib` |
| `jaso-j438pa-2r-2r-213` | `jaso-j438pa-2r` | 213 ft 2R | `luffing-jib` |

The p. 1 overview publishes jib configurations from 98 ft to 213 ft and both TD and 2R variants.
Choosing the **213 ft TD** and **213 ft 2R** rows is an **INDICATIVE project selection**: the chart
values themselves are transcribed from p. 2, but the datasheet also publishes shorter jibs, so the
configuration choice is not a manufacturer recommendation. The `defaultJibM` provenance is
`indicative` for that reason; `maxJibLengthM`, the chart and the maximum capacity keep `source`
provenance.

### 6.1 Load-chart transcription

The p. 2 charts are imperial. Catalogue values are converted with exactly:

```text
1 ft = 0.3048 m
1 lb = 0.00045359237 t
```

Page 2 prints five chart groups, identified by their head-line capacities:

| Head-line group | Configuration |
| --- | --- |
| TD 35,300 lb | TD chart, 213 ft jib row |
| TD/2R 35,300 / 70,500 lb | combined chart; 2R 70,500 lb values only on the 98-164 ft 2R jib rows |
| 2R 39,700 lb | 2R chart, 213 ft jib row |
| 2R 52,900 lb | 2R chart, 197 ft jib row |
| 2R 66,100 lb | 2R chart, 180 ft jib row |

The catalogue's 213 ft 2R entry is transcribed from the **2R 39,700 lb** chart. The 70,500 lb values
belong to the separate TD/2R combined chart and are printed only for the 98-164 ft 2R rows; that
chart's 180-213 ft rows carry TD values only. Substituting the 70,500 lb chart for the 39,700 lb chart
would apply a shorter-jib capacity to the 213 ft configuration, so the chart families must not be
mixed.

TD chart, 213 ft jib row (82 ft to 213 ft):

| Radius (ft) | Radius (m) | Capacity (lb) | Capacity (t) |
| --- | --- | --- | --- |
| 82 | 24.9936 | 35,300 | 16.0118 |
| 98 | 29.8704 | 35,300 | 16.0118 |
| 115 | 35.0520 | 33,500 | 15.1953 |
| 131 | 39.9288 | 26,500 | 12.0202 |
| 148 | 45.1104 | 21,200 | 9.6162 |
| 164 | 49.9872 | 16,800 | 7.6204 |
| 180 | 54.8640 | 13,200 | 5.9874 |
| 197 | 60.0456 | 10,100 | 4.5813 |
| 213 | 64.9224 | 7,500 | 3.4019 |

2R chart, 213 ft jib row:

| Radius (ft) | Radius (m) | Capacity (lb) | Capacity (t) |
| --- | --- | --- | --- |
| 82 | 24.9936 | 39,700 | 18.0076 |
| 98 | 29.8704 | 39,700 | 18.0076 |
| 115 | 35.0520 | 32,600 | 14.7871 |
| 131 | 39.9288 | 25,800 | 11.7027 |
| 148 | 45.1104 | 20,300 | 9.2079 |
| 164 | 49.9872 | 15,900 | 7.2121 |
| 180 | 54.8640 | 12,300 | 5.5792 |
| 197 | 60.0456 | 9,300 | 4.2184 |
| 213 | 64.9224 | 6,600 | 2.9937 |

The catalogue stores the converted metres and tonnes, with the chart point's own p. 2 provenance. The
maximum capacity is the first chart value: **16.0118 t** for TD and **18.0076 t** for 2R. The first
published radius is **24.9936 m (82 ft)** and is stored as `minRadiusM`. The imperial labels remain
the authoritative source; the metric values are conversions, not a second manufacturer table.

### 6.2 Luffing-jib safeguard

A luffing jib changes radius by changing the jib angle, not by moving a trolley along a fixed jib.
The current capacity engine models a trolley-jib crane and cannot represent that geometry. The
catalogue therefore marks both entries `craneType: "luffing-jib"`, and:

- `capacityAt` returns `null` immediately for a luffing-jib model, even for a jib/radius pair that
  appears in the published chart;
- `evaluatePick` returns status `UNSUPPORTED` with issue `unsupported-crane-type`, and no capacity or
  utilisation;
- the dialog reports "not evaluated" and does not apply the trolley-jib capacity method;
- the selection matrix lists the entries but excludes them from `evaluatedCraneCount`, never counts
  them as passing, and shows a `no-supported-cranes` state when every catalogue entry is luffing-jib.

This is deliberately conservative. It prevents a luffing-jib chart from being read through a
trolley-jib formula and presented as an equivalent capacity result. Evaluating these entries needs a
luffing-geometry capacity model that is not part of this task.

### 6.3 Heights, dimensions and components

- **Height under hook:** `notStated`. The only height printed on p. 1 is **H = 237 ft**, labelled
  "Maximum height under hook without fastening". That is a without-fastening/freestanding height, not
  an overall height under hook, so it is not copied into `heightUnderHookM`.
- **Freestanding height:** **237 ft = 72.2376 m** (p. 1), stored in `freestandingHeightM` with that
  p. 1 provenance.
- **Mast width, base width, counter-jib structural length, counter-jib radius:** all `notStated` with
  a reason. The p. 1 drawing labels jib sections and heights but no mast or base width. The p. 6
  packing list's 21.7 ft length is a combined transport package, not a bare counter-jib structural
  length.
- **Heaviest erection component:** `notStated`. The pp. 6-7 packing list is a transport list, not an
  erection-component schedule, so it does not establish the heaviest single lift.
- **Combined transport package:** the packing-list line "Counterjib + Mechanisms + Reeving block +
  Auxiliary jib" is **45,310 lb = 20.5523 t**. It is stored separately in `combinedTransportPackage`
  and is **not** used as the heaviest erection component. A combined package mass is not the mass of
  any one item that has to be lifted during erection. The same packing list separately prints a
  **26,150 lb** line described as "Counterjib + Luffing mechanisms + Reeving block + Auxiliary jib".
  That is a different transport package and is not added as a catalogue entry because the schema
  stores only one combined package. Do not apply the 45,310 lb description to the 26,150 lb line or
  vice versa.

The `notStated` entries are not gaps to be filled with plausible numbers. They record that the
inspected document does not publish the value; a later source can replace them with a sourced value
and a page reference.

## 7. Validation and tests

`validateCatalogue` fails when:

- a crane number is not wrapped in `{ value, provenance }`;
- a `source` provenance names an undefined source id;
- a source is missing a document name or a positive integer page;
- an `indicative` provenance has no basis;
- a `notStated` value has no reason, or a `notStated` value also carries a numeric value;
- required crane fields, dimensions or the heaviest component are missing;
- a Potain trolley-jib crane's heaviest component is `notStated`; `notStated` is permitted only for the
  JASO model;
- the catalogue has fewer than 4 or more than 6 entries, the default crane is not
  `potain-mct-88`, or the first entry is not `potain-mct-88`;
- `craneType`, `modelId`, `modelName` or `configuration` is missing, and the JASO model is not
  `luffing-jib`;
- a model group has inconsistent names or duplicate configurations, or the JASO model does not have
  exactly two configurations;
- the tip-load table is empty, non-ascending, non-positive, increases as the jib gets longer, or
  extends beyond the maximum jib;
- a load chart is empty, malformed, non-ascending in jib or radius, has a radius beyond its jib, has a
  capacity above the crane maximum, or has a capacity that increases with radius;
- a chart row is missing `minRadiusM`, has a non-positive minimum radius, has a minimum radius beyond
  the jib length, or has a first point below the declared minimum radius;
- a chart row's jib does not match a tip-load row, or the default jib is not a published chart
  configuration;
- a combined transport package has no name, no mass, or a non-positive mass;
- crane ids are duplicated or the schema version is unsupported.

The tip-load monotonicity check allows only `1e-9 t` of floating-point noise. Equal adjacent values
are allowed; a larger tolerance would hide a real increase between published rows.

The real catalogue is validated when `src/catalogue.ts` is imported. Invalid data stops the plugin
from loading instead of producing a plausible-looking but unsourced capacity.

Tests cover all four catalogue entries, the chart lookup and its conservative step-down, the 2.7 m
minimum radius, out-of-range and invalid jibs, filtering, the `SIMULATED` wind rule (including invalid
wind), the tip-load monotonicity check, and the metre-to-millimetre boundary. The MCT 88 test values
are taken from p. 4 and the MCT 85 F5 values from p. 3, with the page noted in the test comments.
Luffing-jib tests assert that
`capacityAt` refuses the chart, that picks are `UNSUPPORTED`, that the matrix never counts those rows
as passing or in the evaluated denominator, and that `no-supported-cranes` is reported when every
entry is luffing-jib. A guard test checks the `.gitignore` rule and confirms that no PDF under the
plugin is tracked.

### Reconstructed validation document

`BACKLOG.md` refers to `docs/validation-calculation.txt`. No original file was present in the working
tree or in Git history. [`validation-calculation.txt`](validation-calculation.txt) is a clearly
labelled **reconstruction** created on 2026-10-28 and revised on 2026-11-10 for the corrected p. 4
chart model. It is not the recovered original and must not be cited as one. It records the MCT 88
chart lookup, step checks, the two page-4 hook tables, source discrepancies and the separate MCT 85 F5
chart spot checks. The MCT 88 PDF is present in `plugins/tower-planner/docs/` but is ignored by Git and
untracked; its SHA-256 is recorded in §2.

## 8. Reproduction

```bash
npx rstest plugins/tower-planner/test
npm run build -w tower-planner
```

The hand calculations used by the tests are written in the test comments. For the MCT 88 head-line
case: 4 t at 30 m on the 30 m jib returns 2.50 t from the p. 4 upper 5 t chart, so
`4 / 2.50 × 100 = 160 %` and the pick fails. The same arithmetic applies to the MCT 85 F5 p. 3
chart, which also returns 2.50 t at 30 m.
The JASO entries are not given a capacity head-line case because the trolley-jib engine deliberately
returns no capacity for them; their tests assert the `UNSUPPORTED` result instead.

> **Planning aid, not a certified lift plan.**
