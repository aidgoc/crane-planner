# Sample site (synthetic, for both Cycle 4 planners)

**Not a real project.** Loads and clearances are INDICATIVE sample values, not sourced data. No client data.

| File | Use |
|---|---|
| `sample-site.dxf` | DXF R2000, units metres (`$INSUNITS` = 6), origin = SW plot corner, +x east, +y north. Test your DXF import with it. |
| `sample-site.png` | The same plan as an image. Test the image-underlay path: calibrate with two clicks on the ends of the 0–20 m scale bar. |
| `sample-site.json` | Heights, clearances and a 5-pick list. DXF has no reliable building height, so extrusion reads it from here, keyed by footprint id. |
| `generate.py` | Regenerates all three (`pip install ezdxf matplotlib` in a venv). |

## What's on it

- **Plot:** 90 × 72 m. The NE corner is a true ARC (R 10 m), on layer `SITE_BOUNDARY`.
- **Proposed buildings** (`BUILDING_PROPOSED`): Tower A, G+24 at 75 m, on a 9 m podium; Tower B, G+14 at 45 m.
- **Neighbours** (`NEIGHBOUR`): a residential building to the east (30 m, oversail by permission only) and a school to the north (12 m, **no oversail**).
- **Hazards and other features:**
  - 22 kV overhead line 9 m west of the plot (`POWER_LINE`, sample clearance 6 m).
  - 18 m public road to the south (`ROAD`), with the site gate on it.
  - A heritage well as a no-go CIRCLE (`NO_GO`).
- **Supply zones** (`SUPPLY_ZONE`): S1 rebar yard, S2 formwork store, S3 concrete pump.
- **Pick list in the JSON:** P1–P5, including the heaviest (P4) and the farthest (P5).

## Entities and parser notes (dxf-parser 1.1.2, verified)

- Entities: `LINE` 12, `ARC` 1, `LWPOLYLINE` 11, `CIRCLE` 6, `TEXT` 24.
- **ARC `startAngle`/`endAngle` come back in radians,** even though DXF stores degrees.
- A closed LWPOLYLINE has `shape: true`.
- The site boundary is LINEs + an ARC, not one polyline, so you have to chain the segments into a closed loop yourself. That is deliberate: real plans look like this.

## Questions your tool should be able to answer on this site

1. Which catalogue crane passes all five picks, and from where?
2. Where can the mast go so the jib never oversails the school, while the counter-jib tail still clears the neighbour?
3. Does the hook clear Tower A at 75 m plus clearance, and is that beyond freestanding height (tie-ins needed)?
4. Is the power line inside the slew circle plus its clearance?
5. *(Mobile)* Where can the mobile crane stand to erect the tower crane without its outriggers on the road or the well?
