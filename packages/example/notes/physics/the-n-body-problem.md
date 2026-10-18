---
type: Concept
title: The N-body problem
description: N point masses under their mutual gravity, followed in time.
---

$N$ point masses, each moving under the pull of all the others by [Newton's law](/physics/newtons-law-of-gravitation.md "requires"). The state is every position and velocity, $6N$ numbers in 3D:

$$
\dot{\mathbf{r}}_i = \mathbf{v}_i, \qquad \dot{\mathbf{v}}_i = \mathbf{a}_i(\mathbf{r}_1, \dots, \mathbf{r}_N)
$$

For $N = 2$ it is solved exactly: ellipses. For $N \ge 3$ there is no closed form, and the motion is chaotic, so it is stepped forward in time numerically.

Two questions run through the whole project: how to step it (the integrator), and how to get the accelerations fast (the force calculation).
