---
type: Concept
title: Second quantisation
description: Writing many-particle states with operators that make and remove particles.
---

Instead of writing a wavefunction for $N$ particles and symmetrising it by hand, say how many particles sit in each single-particle state. The operator $c^\dagger_{i\sigma}$ puts an electron of spin $\sigma$ on orbital $i$; $c_{i\sigma}$ takes one away.

For fermions they anticommute:

$$
\{c_{i\sigma}, c^\dagger_{j\sigma'}\} = \delta_{ij}\,\delta_{\sigma\sigma'}, \qquad \{c_{i\sigma}, c_{j\sigma'}\} = 0
$$

so $(c^\dagger_{i\sigma})^2 = 0$: Pauli exclusion comes for free.

The number operator $n_{i\sigma} = c^\dagger_{i\sigma} c_{i\sigma}$ counts the electrons in a state, 0 or 1. A one-body term such as hopping is $\sum_{ij} t_{ij}\, c^\dagger_{i\sigma} c_{j\sigma}$; a two-body term such as the Coulomb repulsion needs four operators.
