---
type: Concept
title: Hybridisation function
description: All the bath does to the impurity, as one function of frequency.
---

Integrate the bath out of the [Anderson impurity model](/impurity-problems/anderson-impurity-model.md "requires"). Because the bath is free, this is exact, and leaves

$$
\Delta(i\omega_n) = \sum_k \frac{|V_k|^2}{i\omega_n - \epsilon_k}
$$

on the [Matsubara frequencies](/many-body-basics/matsubara-frequencies.md "requires"). The impurity's free Green's function is then $\mathcal{G}_0^{-1}(i\omega_n) = i\omega_n - \varepsilon_d - \Delta(i\omega_n)$.

So two baths with different $\epsilon_k$ and $V_k$ but the same $\Delta$ give the same impurity physics. In DMFT we never need the bath itself, only $\Delta$.
