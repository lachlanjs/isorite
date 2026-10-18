---
type: Concept
title: Diagnostics
description: Energy drift and momentum, measured as the run goes.
---

Every 100 steps, record the [energy](/physics/energy-conservation.md "requires") and the total momentum.

- **Energy drift**, $|E - E_0|/|E_0|$. On the two-body orbit with $\Delta t = T/100$: with Euler the drift passes 0.5 and the orbit more than doubles in size within ten periods; with leapfrog the drift stays at a few parts in a million for as long as it runs.
- **Momentum** should stay at zero to rounding. If it does not, a pair's forces are not equal and opposite: a bug.

Plot both against time on a log scale. A drift that grows steadily means the integrator; one that jumps means a close pass, and [softening](/physics/softening.md "see also").
