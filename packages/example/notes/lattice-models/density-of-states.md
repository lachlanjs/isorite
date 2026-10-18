---
type: Concept
title: Density of states
description: How many states there are at each energy.
---

$$
D(\varepsilon) = \frac{1}{N} \sum_k \delta(\varepsilon - \varepsilon_k)
$$

For a [tight-binding](/lattice-models/tight-binding.md "requires") band it is all the lattice's geometry that matters for local quantities: a sum over $k$ of anything that depends on $k$ only through $\varepsilon_k$ becomes an integral over $\varepsilon$ with weight $D(\varepsilon)$.

Two I use:
- the hypercubic lattice in infinite dimensions: a Gaussian;
- the Bethe lattice: a semicircle, $D(\varepsilon) = \frac{2}{\pi D^2}\sqrt{D^2 - \varepsilon^2}$, half-bandwidth $D$.
