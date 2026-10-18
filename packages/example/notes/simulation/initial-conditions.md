---
type: Concept
title: Initial conditions
description: "Where the bodies start: a two-body orbit to test, then a Plummer sphere for a galaxy."
---

**A two-body orbit**, to test the integrator: two masses of $\tfrac12$ a distance 1 apart, each moving at right angles to the line between them at

$$
v = \sqrt{\frac{G m}{2d}} = \tfrac12
$$

so that each circles the centre of mass at radius $\tfrac12$. Its period is $T = 2\pi \cdot \tfrac12 / \tfrac12 = 2\pi$. Any drift away from the circle is the integrator's.

**A Plummer sphere**, for a galaxy: density $\rho(r) \propto (1 + r^2/a^2)^{-5/2}$. A radius is drawn from a uniform $X$ in $(0, 1)$ as

$$
r = \frac{a}{\sqrt{X^{-2/3} - 1}}
$$

and the speeds so that the sphere is in equilibrium. It sits still, which is the first test of the [main loop](/simulation/the-main-loop.md "see also").
