# Mobile Crane Planner

This plugin ports the Cycle 3 mobile-crane KIT and load-chart interpolation.
Calculations use metres; conversion to Chili3D millimetres is intentionally not
part of M1.

> Planning aid, not a certified lift plan.

The Grove GMK5250L-1 chart data is currently `INDICATIVE`: the original
manufacturer PDF, page 17, was not available for verification in this
environment. See [SOURCES.md](SOURCES.md) for the complete number-level source
record.

## M3 Outrigger Pad Reactions

- **Inputs:** Total machine + load weight $W$, outrigger longitudinal spread $L$, and transverse spread $B$ are user inputs (no invented numbers).
- **Statics:**
  - Symmetric load: $R_i = W / 4$ for all 4 pads (FL, FR, RL, RR).
  - Eccentric load ($e_x, e_y$): $R_i = W/4 \pm W \cdot e_x / (2L) \pm W \cdot e_y / (2B)$.
  - Matches hand moment balance $\sum F_z = W$, $\sum M_x = W \cdot e_y$, $\sum M_y = W \cdot e_x$.
- **Stability:** A negative reaction flags pad uplift (tipping condition).

