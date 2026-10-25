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

### Import

```typescript
import {
    computeClearanceDistance,
    createBuildingBox,
    createBoomCylinder,
    type ClearanceResult
} from "./clearance/distance";
```

### Computing Distance Between Two Solids

```typescript
import { ShapeFactory } from "@chili3d/wasm";
import { computeClearanceDistance } from "@chili3d-crane/mobile-planner";

const factory = new ShapeFactory();

// Building solid (dimensions and origin in metres)
const buildingSolid = createBuildingBox(
    factory,
    { x: 0, y: 0, z: 0 },
    { dx: 40, dy: 22, dz: 75 } // Tower A: 40x22 m footprint, 75 m height
);

// Boom solid (cylinder: base center, radius, and length in metres)
const boomSolid = createBoomCylinder(
    factory,
    { x: 42.5, y: 10, z: 0 }, // Positioned in metres
    0.4,                      // 0.4 m boom radius
    35                        // 35 m boom length
);

// Calculate 3D clearance
const result: ClearanceResult = computeClearanceDistance(buildingSolid, boomSolid, factory);

console.log(`Distance: ${result.distanceM} m`);
console.log(`Collision: ${result.isCollision}`);
console.log(`Touching: ${result.isTouching}`);
```

### Return Type (`ClearanceResult`)

| Property | Type | Description |
|---|---|---|
| `distanceM` | `number` | Minimum surface-to-surface distance in metres |
| `distanceMm` | `number` | Minimum distance in kernel millimetres |
| `isCollision` | `boolean` | `true` if solids penetrate/overlap each other |
| `isTouching` | `boolean` | `true` if solids touch tangentially (0 gap) without volume penetration |

---

## 3. Verified Acceptance Test Cases (Task M5)

All 4 dry-run cases pass automated testing against OpenCASCADE with hand-worked verification:

1. **2.0 m separation:** Box $[0, 10]\,\text{m}$, Cylinder center $X = 12.5\,\text{m}$, $R = 0.5\,\text{m}$.  
   Nearest surface = $12.5 - 0.5 = 12.0\,\text{m}$. Distance $= 12.0 - 10.0 = \mathbf{2.00\,\text{m}}$ ($\pm 0.1\,\text{m}$). Verdict: `SAFE`.
2. **0.5 m separation:** Box $[0, 10]\,\text{m}$, Cylinder center $X = 11.0\,\text{m}$, $R = 0.5\,\text{m}$.  
   Nearest surface = $11.0 - 0.5 = 10.5\,\text{m}$. Distance $= 10.5 - 10.0 = \mathbf{0.50\,\text{m}}$ ($\pm 0.1\,\text{m}$). Verdict: `TIGHT CLEARANCE`.
3. **0.0 m (Touching):** Box $[0, 10]\,\text{m}$, Cylinder center $X = 10.5\,\text{m}$, $R = 0.5\,\text{m}$.  
   Nearest surface $= 10.0\,\text{m}$. Distance $= \mathbf{0.00\,\text{m}}$, `isTouching = true`, `isCollision = false`.
4. **Overlap (Collision):** Box $[0, 10]\,\text{m}$, Cylinder center $X = 10.0\,\text{m}$, $R = 0.5\,\text{m}$.  
   Cylinder penetrates $0.5\,\text{m}$ into the box volume. Distance $= 0.00\,\text{m}$, `isCollision = true`.

---

## 4. Running Tests

```bash
npx rstest plugins/mobile-planner/test/clearance.test.ts
```
