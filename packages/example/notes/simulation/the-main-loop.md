---
type: Concept
title: The main loop
description: The program's heart: step, and now and then measure.
---

Rests on [leapfrog](/integrators/leapfrog.md "requires") for the step and [direct summation](/algorithms/direct-summation.md "requires") for the forces, with [the timestep](/integrators/choosing-the-timestep.md "uses") fixed.

```python
r, v, m = initial_conditions()
a = accelerations(r, m)
for step in range(steps):
    v += 0.5 * dt * a
    r += dt * v
    a = accelerations(r, m)
    v += 0.5 * dt * a
    if step % 100 == 0:
        record(step * dt, energy(r, v, m))
```

All the time is in `accelerations`. Making it faster is the whole of [two galaxies colliding](/simulation/two-galaxies-colliding.md "see also").
