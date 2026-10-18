---
type: Concept
title: Cost and accuracy
description: What each force calculation costs, and how to check a fast one against the slow one.
---

| method | cost per step | error |
|---|---|---|
| [direct summation](/algorithms/direct-summation.md "uses") | $N^2$ | none but rounding |
| [Barnes–Hut](/algorithms/barnes-hut.md "requires") | $N \log N$ | grows with $\theta$ |

To check: take 100 bodies at random, compute their accelerations both ways, and look at the relative error $|\mathbf{a}_{\text{BH}} - \mathbf{a}| / |\mathbf{a}|$. Its median should be well under the energy drift the run can tolerate (see [diagnostics](/simulation/diagnostics.md "uses")).

Where the two costs cross depends on the code: measure it, at a few $N$, rather than trust the exponents.
