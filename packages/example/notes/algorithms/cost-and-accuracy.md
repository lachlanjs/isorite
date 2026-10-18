---
type: Concept
title: Cost and accuracy
description: What each force calculation costs, and how to check a fast one against the slow one.
---

- [Direct summation](/algorithms/direct-summation.md "uses") costs $N^2$ a step, and is exact but for rounding.
- [Barnes–Hut](/algorithms/barnes-hut.md "requires") costs $N \log N$, with an error that grows with $\theta$.

To check: take 100 bodies at random, compute their accelerations both ways, and look at the relative error $|\mathbf{a}_{\text{BH}} - \mathbf{a}| / |\mathbf{a}|$. Its median should be well under the energy drift the run can tolerate (see [diagnostics](/simulation/diagnostics.md "uses")).

Where the two costs cross depends on the code: measure it, at a few $N$, rather than trust the exponents.
