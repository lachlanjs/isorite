---
type: Concept
title: Quasiparticle weight
description: How much of a real electron the low-energy excitation still is.
---

Expand the [self-energy](/many-body-basics/self-energy.md "requires") near the Fermi level: $\Sigma(\omega) \approx \Sigma(0) + \omega\,\partial_\omega \operatorname{Re}\Sigma$. Then $G$ has a pole with residue

$$
Z = \left(1 - \left.\frac{\partial \operatorname{Re}\Sigma}{\partial \omega}\right|_{\omega=0}\right)^{-1}, \qquad 0 < Z \le 1.
$$

$Z$ is the weight of the quasiparticle peak in the [spectral function](/many-body-basics/spectral-function.md "requires"); the rest, $1 - Z$, is spread out at higher energies. The effective mass grows as $m^*/m = 1/Z$ when $\Sigma$ does not depend on $k$.

$Z \to 0$ is one way a metal stops being a metal.
