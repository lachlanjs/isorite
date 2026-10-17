---
type: Concept
title: Hubbard model
description: Tight binding plus a repulsion between two electrons on the same site.
---

The simplest model where electrons both move and interact:

$$
H = -t \sum_{\langle ij \rangle \sigma} c^\dagger_{i\sigma} c_{j\sigma} + U \sum_i n_{i\uparrow} n_{i\downarrow}
$$

The first term is [tight binding](/lattice-models/tight-binding.md "requires"): it wants electrons spread out as Bloch waves. The second costs $U$ whenever a site is doubly occupied: it wants them localised, one per site.

At half filling the competition between the two, $U$ against the bandwidth $W$, decides whether it is a metal or an insulator.

No exact solution except in one dimension (Bethe ansatz) and in infinite dimensions, where DMFT is exact.
