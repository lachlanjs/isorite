---
type: Concept
title: Leapfrog
description: Half a kick, a whole drift, half a kick: second order, and its energy error does not grow.
---

Like [Euler's method](/integrators/eulers-method.md "see also") it steps [the N-body problem](/physics/the-n-body-problem.md "requires"), but in three parts (kick, drift, kick):

```python
v += 0.5 * dt * a
r += dt * v
a = accelerations(r, m)
v += 0.5 * dt * a
```

One force calculation per step, as for Euler, and the last one is reused at the start of the next step.

It is second order, and it is time-reversible: run it with $-\Delta t$ and it retraces its steps exactly. Its energy error oscillates and stays bounded, because it is [symplectic](/integrators/symplectic-integrators.md "uses").
