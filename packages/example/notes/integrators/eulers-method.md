---
type: Concept
title: Euler's method
description: The simplest step: move each body along its velocity, then change the velocity by the acceleration.
---

Steps [the N-body problem](/physics/the-n-body-problem.md "requires") forward by $\Delta t$:

```python
r_new = r + dt * v
v_new = v + dt * accelerations(r, m)
```

It is first order: halve $\Delta t$ and the error at a fixed time halves.

On an orbit it fails in one direction. Each step moves along the tangent, which leaves the circle outwards, so the orbit [gains energy](/physics/energy-conservation.md "uses") every turn and spirals out. Smaller steps only slow the spiral down.
