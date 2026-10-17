---
type: Concept
title: Matsubara frequencies
description: The discrete frequencies on which finite-temperature Green's functions live.
---

At temperature $T$, run time along the imaginary axis, $\tau \in [0, \beta)$ with $\beta = 1/T$. The [Green's function](/many-body-basics/greens-function.md "requires") is then antiperiodic in $\tau$ for fermions, $G(\tau + \beta) = -G(\tau)$, so its Fourier series has only the frequencies

$$
\omega_n = \frac{(2n+1)\pi}{\beta}, \qquad n \in \mathbb{Z}.
$$

Bosons get $\nu_n = 2n\pi/\beta$ instead.

$G(i\omega_n)$ is smooth and easy to compute numerically, which is why quantum Monte Carlo works here. The price: getting back to real frequencies (analytic continuation) is ill-posed.
