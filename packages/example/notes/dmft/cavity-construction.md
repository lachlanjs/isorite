---
type: Concept
title: Cavity construction
description: Deriving the single-site effective action by removing one site from the lattice.
---

Single out one site $o$ and integrate out all the others. What is left is an effective action for site $o$ alone,

$$
S_{\text{eff}} = -\int_0^\beta d\tau\, d\tau' \sum_\sigma c^\dagger_{o\sigma}(\tau)\, \mathcal{G}_0^{-1}(\tau - \tau')\, c_{o\sigma}(\tau') + U \int_0^\beta d\tau\, n_{o\uparrow}(\tau)\, n_{o\downarrow}(\tau)
$$

where the lattice with the site removed, the cavity, enters only through $\mathcal{G}_0$. In [infinite dimensions](/dmft/infinite-dimensions.md "requires"), with the [local self-energy](/dmft/local-self-energy.md "requires"), only the term quadratic in the fermions survives, so the expression above is exact.

$\mathcal{G}_0$ depends on the cavity Green's function, which has to be found self-consistently.
