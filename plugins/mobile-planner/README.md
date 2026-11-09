# Mobile Crane Lift Planner — 3D Boom Clearance Engine

> **Planning aid, not a certified lift plan.** This exact disclaimer must appear in the UI and on every report.

**Owner:** Abhishek (Mobile Crane Lift Planner Team: Rushikesh, Ajit, Sujal, Abhishek)  
**Milestone:** Task M5 (Distance Dry Run — Check-in 1: Wed 28 Oct 2026)

---

## 1. Overview

This module provides 3D CAD clearance calculations between mobile crane components (boom, hook, load) and site obstacles (buildings, structures, power lines).

It queries the OpenCASCADE C++ WebAssembly kernel (`BRepExtrema_DistShapeShape` via Chili3D's `IShape.extremaDistance` and `IShapeFactory.booleanCommon`) to compute the exact minimum Euclidean distance between solids and detect volume penetration (collisions).

All public interface calculations and coordinates are in **metres (m)**, with conversion to/from OpenCASCADE kernel units (**millimetres**, ×1000) handled at the module boundary.

---

## 2. API Usage for Teammates

### Calling it from a plugin

Inside the running app, use the application's own shape factory. Do **not** create a `ShapeFactory` from
`@chili3d/wasm` in plugin code: the app has already initialised the kernel, and a plugin must not bundle a
second copy of it.

```typescript
// from any file under plugins/mobile-planner/src/ (e.g. the M6 boom/load check)
import { getCurrentApplication } from "@chili3d/core";
import { computeClearanceDistance, createBoomCylinder, createBuildingBox } from "./clearance/distance";

const factory = getCurrentApplication().shapeProvider.factory;

// Building solid (origin and size in metres). Illustrative numbers, not site data.
const buildingSolid = createBuildingBox(factory, { x: 0, y: 0, z: 0 }, { dx: 40, dy: 22, dz: 75 });

// Boom solid (base centre, radius, length in metres, optional direction). Illustrative numbers.
const boomSolid = createBoomCylinder(factory, { x: 42.5, y: 10, z: 0 }, 0.4, 35);

const result = computeClearanceDistance(buildingSolid, boomSolid, factory);
console.log(result.distanceM, result.isCollision, result.isTouching);
```

`factory` is **required**. A minimum distance of 0 means "touching *or* overlapping"; the factory is what
tells them apart (`booleanCommon` volume). If that boolean test fails or throws, the result is reported as a
**collision**, never as "touching", so a planning aid cannot under-report a clash.

In unit tests there is no running app, so tests create `new ShapeFactory()` from `@chili3d/wasm` after
`initWasm()` (see `test/setup.ts`).

### Return Type (`ClearanceResult`)

| Property | Type | Description |
|---|---|---|
| `distanceM` | `number` | Minimum surface-to-surface distance in metres |
| `distanceMm` | `number` | Minimum distance in kernel millimetres |
| `isCollision` | `boolean` | `true` if solids penetrate/overlap each other |
| `isTouching` | `boolean` | `true` if solids touch tangentially (0 gap) without volume penetration |

### Errors and fail-safe behaviour

| Situation | Result |
|---|---|
| Solids are apart (gap greater than the kernel tolerance) | `distanceM > 0`, `isCollision = false`, `isTouching = false` |
| Gap is 0 and the shared volume is tiny (at most 1 mm³, numerical noise) | `isTouching = true` |
| Gap is 0 and the shared volume is larger than 1 mm³ | `isCollision = true` |
| Gap is 0 and the overlap test (`booleanCommon`) fails or throws | `isCollision = true` (fail safe, never "touching") |
| Gap is 0 and `booleanCommon` returns an empty shape (no shared volume) | `isTouching = true` |
| `extremaDistance` returns a negative value (empty or invalid shape) | `Error` is thrown. Catch it and show "distance unavailable". Never treat it as 0 or as safe. |
| `createBuildingBox` / `createBoomCylinder` cannot build the solid | `Error` is thrown with the kernel message |

---

## 3. Verified Acceptance Test Cases (Task M5)

8 automated tests pass against OpenCASCADE with hand-worked verification: a units check, the 4 backlog dry-run cases (1 to 4), 2 safety cases (5 and 6) and 1 inclined boom case (7):

1. **2.0 m separation:** Box $[0, 10]\,\text{m}$, Cylinder center $X = 12.5\,\text{m}$, $R = 0.5\,\text{m}$.  
   Nearest surface = $12.5 - 0.5 = 12.0\,\text{m}$. Distance $= 12.0 - 10.0 = \mathbf{2.00\,\text{m}}$ ($\pm 0.1\,\text{m}$).
2. **0.5 m separation:** Box $[0, 10]\,\text{m}$, Cylinder center $X = 11.0\,\text{m}$, $R = 0.5\,\text{m}$.  
   Nearest surface = $11.0 - 0.5 = 10.5\,\text{m}$. Distance $= 10.5 - 10.0 = \mathbf{0.50\,\text{m}}$ ($\pm 0.1\,\text{m}$).
3. **0.0 m (Touching):** Box $[0, 10]\,\text{m}$, Cylinder center $X = 10.5\,\text{m}$, $R = 0.5\,\text{m}$.  
   Nearest surface $= 10.0\,\text{m}$. Distance $= \mathbf{0.00\,\text{m}}$, `isTouching = true`, `isCollision = false`.
4. **Overlap (Collision):** Box $[0, 10]\,\text{m}$, Cylinder center $X = 10.0\,\text{m}$, $R = 0.5\,\text{m}$.  
   Cylinder penetrates $0.5\,\text{m}$ into the box volume. Distance $= 0.00\,\text{m}$, `isCollision = true`.

5. **Boom fully inside the building:** Cylinder $R = 0.5\,\text{m}$ at $(5, 5)$ lies wholly within Box $[0, 10]\,\text{m}$.
   Distance $= 0$, shared volume $= \pi \cdot 0.5^2 \cdot 15 = 11.78\,\text{m}^3$, so `isCollision = true`.
6. **Overlap test unavailable (fail safe):** if `booleanCommon` throws, a zero distance is reported as
   `isCollision = true`, never as `isTouching`.
7. **Inclined boom (45 degrees):** Box $10 \times 10 \times 20\,\text{m}$ at the origin, cylinder $R = 0.5\,\text{m}$, base centre $(12.5, 5, 5)\,\text{m}$,
   axis tilted 45 degrees from vertical, away from the building. The nearest rim point of the tilted base disc is at
   $x = 12.5 - 0.5\cos 45^\circ = 12.146\,\text{m}$. Distance $= 12.146 - 10 = \mathbf{2.146\,\text{m}}$.

---

## 4. Running Tests

```bash
npx rstest plugins/mobile-planner/test/clearance.test.ts
```
# Mobile Crane Planner

This plugin ports the Cycle 3 mobile-crane KIT and exact load-chart lookup.
Calculations use metres; conversion to Chili3D millimetres is intentionally not
part of M1.

> Planning aid, not a certified lift plan.

The M1 chart values have been verified against the official Grove GMK5250L-1
load-chart PDF, page 17. See [SOURCES.md](SOURCES.md) for the complete source
record and the traceable page-17 transcription.

## M3 Outrigger Pad Reactions

- **Inputs:** Total machine + load weight $W$, outrigger longitudinal spread $L$, and transverse spread $B$ are user inputs (no invented numbers).
- **Statics:**
  - Symmetric load: $R_i = W / 4$ for all 4 pads (FL, FR, RL, RR).
  - Eccentric load ($e_x, e_y$): $R_i = W/4 \pm W \cdot e_x / (2L) \pm W \cdot e_y / (2B)$.
  - Matches hand moment balance $\sum F_z = W$, $\sum M_x = W \cdot e_y$, $\sum M_y = W \cdot e_x$.
- **Stability:** A negative reaction flags pad uplift (tipping condition).



## M4 Ground Bearing vs User Allowable & Stability Verdict

- **Ground bearing pressure:** $p = R / A$ where $R$ = pad reaction (t) and $A$ = pad area (m²). Converted to kPa via standard gravity $g = 9.80665$ kN/t.
- **PASS/FAIL verdict:** If the user supplies an allowable soil bearing capacity $q_\text{allow}$ (t/m²), every pad is checked: $p \leq q_\text{allow}$ → PASS, $p > q_\text{allow}$ → FAIL. If no allowable is given, status is NOT_CHECKED.
- **Tipping detection:** If any pad reaction $R_i < 0$, the verdict is FAIL with an explicit "tipping" keyword, regardless of bearing capacity. This satisfies the backlog requirement: *"a case where one pad reaction goes negative returns 'tipping'"*.
- **UI Panel:** `createGroundBearingPanel()` provides a vanilla DOM panel with live inputs for pad area and allowable capacity. Inputs default to empty (requiring explicit site inputs, labeled `INDICATIVE` on screen to avoid unsourced assumptions) and display `NOT_CHECKED` until valid inputs are provided; clearing fields immediately reverts to `NOT_CHECKED`. Features a 4-pad grid with per-pad status badges, a reactive verdict banner, and the mandatory planning disclaimer.
- **Sources:** All formulas are standard statics (no invented soil values). User-entered allowable is a parameter, not a hardcoded number. See [SOURCES.md](SOURCES.md).
## M6 Boom Clearance to Site Obstacles

- **3D Solids:** Crane boom is modelled as an extruded cylinder from pivot `(x, y, z)` with user-supplied radius $R$, length $L$, slew angle $\theta$, and elevation $\alpha$. Site buildings are extruded from 2D polygons into 3D prisms (`buildBuildingSolid`).
- **Power Line Hazard:** Modelled as a conservative vertical face at the power line's `x_m` (sample site: $x = -9.0\,\text{m}$), spanning $\pm 200\,\text{m}$ in $Y$ and $0\text{--}200\,\text{m}$ in $Z$ (`buildPowerLineWall`). The real wire height is not in the site data, so the wall is taller than the wire. A boom that crosses the wall is reported `CRITICAL` with `isTouching = true` and `isCollision = false`.
- **Clearance Query:** Evaluates Euclidean distance via OpenCASCADE `extremaDistance` and `booleanCommon`.
- **Status Classification:**
  - `SAFE`: $\text{distance} \ge \text{clearanceLimitM}$ (shown green)
  - `WARNING`: $0 < \text{distance} < \text{clearanceLimitM}$ (shown red per BACKLOG rule)
  - `CRITICAL`: Collision or touching ($\text{distance} = 0$, shown red)
- **Verified Acceptance Test:** Boom $20\,\text{m}$, elevation $30^\circ$, slew $0^\circ$ from $(5, 31, 0)\,\text{m}$ gives $2.43\,\text{m}$ ($\pm 0.1\,\text{m}$) clearance to Tower A west face ($x = 25\,\text{m}$), verified by exact hand calculation.
- **Fail-safe:** Empty site returns `worstCase = null`, preventing false `SAFE` indication. Input validation (`validateBoomPlacement`, `validateObstacleFootprint`, `validatePowerLineObstacle`) rejects invalid boom, building height, polygon, power-line position and clearance limit before the kernel runs, so bad data cannot produce a false `SAFE`.

## M7 Swing Sweep

`sweepSlew(factory, basePlacement, fromDeg, toDeg, stepDeg, buildings, powerLine?)` runs the M6 clearance check at every sampled slew angle between the pick and the set position, and reports the worst result over all angles and all obstacles (`worstStep`, `anyCollision`, one `SweepStep` per angle).

- **Angles:** degrees, slew $0^\circ$ = east, counter-clockwise (same as M6). Both end angles are always sampled. Angles are **not wrapped**: $0^\circ \to 270^\circ$ sweeps $270^\circ$ and $350^\circ \to 10^\circ$ sweeps $340^\circ$ downwards. Pass the arc the boom really swings through.
- **Step size:** BACKLOG M7 uses $2^\circ$ to $5^\circ$. A sweep may use at most `MAX_SWEEP_SAMPLES` (5000) angles (exactly 5000 is allowed); a smaller step throws `RangeError` before any geometry is built, because every sample is a full kernel check. `generateSlewAngles` checks its own inputs: a zero, negative, `NaN` or infinite step, or a non-finite angle, throws `RangeError`. The end angle is always the last sample, also for a very small sweep.
- **Worst result:** the most severe status first (`CRITICAL`, then `WARNING`, then `SAFE`), then the smallest distance. No obstacles gives `worstStep = null`, never `SAFE`.
- **Verified acceptance test:** boom $12\,\text{m}$ ($r = 0.5\,\text{m}$, horizontal) from $(10, 10, 0)\,\text{m}$, swept $0^\circ \to 90^\circ$ past Tower A. The boom is a cylinder, so the closest point is the rim of its flat end, $\sqrt{L^2 + r^2} = 12.0104\,\text{m}$ from the pivot, lined up with the Tower A corner $(25, 20)$, $D = \sqrt{15^2 + 10^2} = 18.0278\,\text{m}$ away. That gives $D - \sqrt{L^2 + r^2} = 6.017\,\text{m}$ at $31.3^\circ$ and at $36.1^\circ$. The kernel returns $6.0174\,\text{m}$ with a $2^\circ$ step ($36^\circ$) and $6.0230\,\text{m}$ with a $5^\circ$ step ($35^\circ$). The difference is $0.0056\,\text{m}$, inside the $0.10\,\text{m}$ tolerance.
- **Between the samples:** the sweep samples the swing, it does not search it continuously, so a collision can fall between two samples. Every result therefore also says what is proved for the whole swing:
  - `betweenSamplesAllowanceM` $= 2\sqrt{L^2 + r^2}\,\sin(\text{gap}/4)$: the most any boom point can move between a sample and the angle halfway to the next sample. The slew turns the boom about the vertical line through its foot, every boom point is at most $\sqrt{L^2 + r^2}$ from the foot, and a point at distance $d$ moves $2d\sin(\delta/2)$ when the slew turns by $\delta = \text{gap}/2$. The distance between two solids changes by at most that.
  - `guaranteedMinDistanceM` $=$ smallest sampled distance $-$ allowance (lowest over all obstacles; can be negative).
  - `sweepStatus`: `CRITICAL` if a sampled angle collides or touches; `SAFE` only if every obstacle has a guaranteed distance of at least its own limit and above $0$; otherwise `WARNING` (red), with the reason in `sweepStatusNote`. No obstacles gives `null`, never `SAFE`.
  - Hand check, acceptance pose with a $5^\circ$ step: allowance $= 2 \cdot 12.0104 \cdot \sin(1.25^\circ) = 0.524\,\text{m}$, sampled minimum $6.023\,\text{m}$, guaranteed $5.50\,\text{m} \ge 2.0\,\text{m}$, so `SAFE`.
  - Test example: a $20\,\text{m}$ boom tip reaching $1\,\text{cm}$ past a wall at $180^\circ$ is `CRITICAL` with a $1^\circ$ step. With a $5^\circ$ step the samples are $0.009\,\text{m}$ from the wall, and `sweepStatus` is `WARNING` (not `SAFE`), also when `clearanceLimitM` is $0$ and every sample reads `SAFE`. Use a smaller step to prove a small gap.
  - `worstStep` and `anyCollision` still describe the sampled angles only.
- **Memory:** CAD shapes live in the WASM heap and are not freed by the JavaScript garbage collector. `sweepSlew` builds the obstacle solids once (`prepareObstacles`), builds one boom solid per angle, and frees every solid it built (also when a check throws). `computeSiteClearance` frees its solids too. The intersection solid from the overlap test in `computeClearanceDistance` is freed. If you call `prepareObstacles` and `checkPreparedObstacles` yourself, call `dispose()` on the prepared obstacles when you are done.
- **Function only.** The swing result is not shown in the UI yet.
