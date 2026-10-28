# Mobile planner sources

> Planning aid, not a certified lift plan.

The intended source for the chart is the **Grove GMK5250L-1 load chart, page
17**, official manufacturer download:
<https://www.manitowoc.com/media/15016/download>. The original PDF could not be
retrieved or inspected while implementing M1, so every number below is marked
**INDICATIVE**. The three acceptance cells are retained from the legacy Cycle 3
KIT, but are **not claimed as independently verified** against the PDF.

| Number | Use | Source | Status |
| --- | --- | --- | --- |
| Grove GMK5250L-1 | Crane name | Grove GMK5250L-1 load chart, p. 17 | INDICATIVE |
| 0.8 m | Pivot offset | Legacy Cycle 3 `craneModel.js` KIT; chart source intended for chart values | LEGACY / INDICATIVE |
| 13.3 m, 23.6 m, 38.0 m, 52.4 m, 70.0 m | Boom length rows | Grove GMK5250L-1 load chart, p. 17 | INDICATIVE |
| 5 m, 8 m, 10 m, 12 m, 15 m, 20 m, 30 m | Radius columns | Grove GMK5250L-1 load chart, p. 17 | INDICATIVE |
| 121.0, 84.5, 64.5 t | 13.3 m row, radii 5/8/10 m | Grove GMK5250L-1 load chart, p. 17 | INDICATIVE |
| 111.0, 83.5, 68.0, 57.0, 45.0, 27.0 t | 23.6 m row, radii 5/8/10/12/15/20 m | Grove GMK5250L-1 load chart, p. 17 | INDICATIVE |
| 59.0, 58.5, 53.0, 47.5, 40.0, 30.5, 17.2 t | 38.0 m row, radii 5/8/10/12/15/20/30 m | Grove GMK5250L-1 load chart, p. 17 | INDICATIVE |
| 31.0, 31.0, 28.5, 23.5, 15.0 t | 52.4 m row, radii 10/12/15/20/30 m | Grove GMK5250L-1 load chart, p. 17 | INDICATIVE |
| 14.5, 14.5, 14.5, 12.1 t | 70.0 m row, radii 12/15/20/30 m | Grove GMK5250L-1 load chart, p. 17 | INDICATIVE |
| User inputs | Total weight W, length spread L, width spread B, eccentricity | Backlog item M3 specification (no invented crane dimensions) | USER INPUT / PARAMETER |
| Rigid plate statics: R_i = W/4 ± W*e_x/(2L) ± W*e_y/(2B) | Pad reaction equilibrium model | Classical statics equilibrium: sum F_z = W, sum M_x = W*e_y, sum M_y = W*e_x | STANDARD STATICS |

