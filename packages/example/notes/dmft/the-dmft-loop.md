---
type: Concept
title: The DMFT loop
description: Iterating between the impurity and the lattice until they agree.
---

Rests on the [self-consistency condition](/dmft/self-consistency-condition.md "requires") and needs an [impurity solver](/impurity-problems/impurity-solver.md "requires").

1. Guess $\Sigma(i\omega_n)$, say zero.
2. Lattice: $G_{\text{loc}} = \sum_k (i\omega_n + \mu - \varepsilon_k - \Sigma)^{-1}$.
3. New Weiss field: $\mathcal{G}_0^{-1} = G_{\text{loc}}^{-1} + \Sigma$.
4. Solve the impurity with $\mathcal{G}_0$: get $G_{\text{imp}}$.
5. New self-energy: $\Sigma = \mathcal{G}_0^{-1} - G_{\text{imp}}^{-1}$. Back to 2 until it stops changing.

## Mixing

Near the [Mott transition](/lattice-models/mott-transition.md "see also") it can swing between the metal and the insulator. Keep part of the old self-energy:

```python
sigma = mix * sigma_new + (1 - mix) * sigma
```
