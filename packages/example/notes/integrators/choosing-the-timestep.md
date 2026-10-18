---
type: Concept
title: Choosing the timestep
description: Small against the fastest motion in the system; fixed, so leapfrog stays symplectic.
---

The step must be small against the shortest timescale that matters. For a circular orbit of period $T$, [leapfrog](/integrators/leapfrog.md "requires") with $\Delta t = T/100$ keeps the energy to a few parts in a million, and the error falls as $\Delta t^2$. An eccentric orbit needs smaller steps: the step must be short against the closest approach.

For a cluster, the crossing time sets the scale: in [the usual units](/physics/units.md "uses") about 2, so $\Delta t \approx 0.01$.

Changing $\Delta t$ from step to step, the obvious way, breaks leapfrog's symplectic property and brings back the drift. Keep it fixed, and use [softening](/physics/softening.md "see also") to keep close passes harmless.
