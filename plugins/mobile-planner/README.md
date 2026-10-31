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

