---
type: Concept
title: Tight binding
description: Electrons hopping between localised orbitals on a lattice.
---

Start from one orbital per site and let electrons hop between neighbours. In [second quantisation](/many-body-basics/second-quantisation.md "requires"),

$$
H_0 = -t \sum_{\langle ij \rangle, \sigma} \left( c^\dagger_{i\sigma} c_{j\sigma} + \text{h.c.} \right)
$$

Fourier transforming, $c_{k\sigma} = N^{-1/2}\sum_i e^{-ik\cdot r_i} c_{i\sigma}$, makes it diagonal: $H_0 = \sum_{k\sigma} \varepsilon_k\, n_{k\sigma}$.

On the square lattice $\varepsilon_k = -2t(\cos k_x + \cos k_y)$, a band of width $8t$. In general the bandwidth is $2zt$ for $z$ neighbours.
