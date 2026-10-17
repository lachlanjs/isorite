---
type: Concept
title: Dyson equation
description: How the full Green's function follows from the free one and the self-energy.
---

The [self-energy](/many-body-basics/self-energy.md "requires") is the sum of all diagrams that cannot be cut in two by removing one free line. Stringing them together gives a geometric series for the [Green's function](/many-body-basics/greens-function.md "requires"):

$$
G = G_0 + G_0 \Sigma G_0 + G_0 \Sigma G_0 \Sigma G_0 + \dots = G_0 + G_0 \Sigma G
$$

or, inverted,

$$
G^{-1} = G_0^{-1} - \Sigma.
$$

This last form is the one used in practice: to get $\Sigma$ from a computed $G$, take $\Sigma = G_0^{-1} - G^{-1}$.
