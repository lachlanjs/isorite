---
type: Concept
title: Self-consistency condition
description: The impurity's Green's function must equal the lattice's local Green's function.
---

Dynamical mean-field theory replaces the lattice by a single site coupled to a bath, the [Anderson impurity model](/impurity-problems/anderson-impurity-model.md "uses"). The site keeps its full local dynamics; the bath stands for everything else.

The bath is not given. It is fixed by demanding that the impurity's Green's function equal the local Green's function of the lattice, with the [Weiss field](/dmft/weiss-field.md "requires") as the unknown and the [Dyson equation](/many-body-basics/dyson-equation.md "requires") to close it:

$$
G_{\text{imp}}(i\omega_n) = \sum_k \frac{1}{i\omega_n + \mu - \varepsilon_k - \Sigma(i\omega_n)}
$$

The sum over $k$ becomes an integral over the [density of states](/lattice-models/density-of-states.md "uses").

In practice the condition is reached by iteration, the DMFT loop.
