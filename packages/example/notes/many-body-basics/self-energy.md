---
type: Concept
title: Self-energy
description: Everything the interactions do to one electron, gathered into one function.
---

Interactions change how an electron propagates. The self-energy $\Sigma(k,\omega)$ collects all of that change: the full [Green's function](/many-body-basics/greens-function.md "requires") is the free one with $\varepsilon_k$ shifted by $\Sigma$,

$$
G(k,\omega) = \frac{1}{\omega - \varepsilon_k - \Sigma(k,\omega)}.
$$

- $\operatorname{Re}\Sigma$ shifts the energy of the excitation.
- $\operatorname{Im}\Sigma$ gives it a finite lifetime.

In a Fermi liquid $\operatorname{Im}\Sigma \propto \omega^2$ near the Fermi level, so quasiparticles live long there.
